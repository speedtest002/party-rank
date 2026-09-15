import { PgBoss, Job } from "pg-boss";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface VideoRenderJob {
  prId: string;
  songIds: number[];
}

const QUEUE_NAME = "video-render";
const RENDER_TIMEOUT_MS = 60000; // 60 seconds per song
const MAX_RETRIES = 1;

async function updateRenderStatus(
  db: Client,
  prId: string,
  annSongId: number,
  status: "pending" | "rendering" | "done" | "failed",
  videoPath?: string,
  error?: string
): Promise<void> {
  await db.query(
    `UPDATE renders SET status = $1, video_path = $2, error = $3, updated_at = NOW()
     WHERE pr_id = $4 AND ann_song_id = $5`,
    [status, videoPath || null, error || null, prId, annSongId]
  );
}

async function fetchRenderData(apiUrl: string, prId: string): Promise<any[]> {
  const response = await fetch(`${apiUrl}/api/party-rank/${prId}/render-data`, {
    headers: { Authorization: `Bearer ${process.env.BOT_SECRET}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch render data: ${response.statusText}`);
  }
  return response.json();
}

async function renderSingleSong(
  prId: string,
  annSongId: number,
  songData: any,
  videoCdnPrefix: string,
  outputDir: string
): Promise<string> {
  const compositionId = "SongScene";
  const outputFileName = `${prId}-${annSongId}.mp4`;
  const outputPath = path.join(outputDir, outputFileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const bundlePath = await bundle(path.join(__dirname, "src/Root.tsx"));
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: compositionId,
    inputProps: { songData, videoCdnPrefix },
  });

  // Render with timeout
  await Promise.race([
    renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { songData, videoCdnPrefix },
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Render timeout")), RENDER_TIMEOUT_MS)
    ),
  ]);

  return outputFileName;
}

async function processJob(job: Job<VideoRenderJob>) {
  const { prId, songIds } = job.data;
  console.log(`[worker] Processing job for PR ${prId}, songs: ${songIds.join(", ")}`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const apiUrl = process.env.APP_URL || "http://localhost:8788";
  const videoCdnPrefix = process.env.VIDEO_CDN_PREFIX || "";
  const outputDir = path.join(__dirname, "out", prId);

  try {
    // Fetch render data for all songs
    const renderDataArray = await fetchRenderData(apiUrl, prId);
    const renderDataMap = new Map(renderDataArray.map((s: any) => [s.song.annSongId, s]));

    for (const annSongId of songIds) {
      const songData = renderDataMap.get(annSongId);
      if (!songData) {
        console.error(`[worker] No render data for song ${annSongId}`);
        await updateRenderStatus(db, prId, annSongId, "failed", undefined, "No render data");
        continue;
      }

      if (!songData.song.videoUrl) {
        console.warn(`[worker] Song ${annSongId} has no video_url, skipping`);
        await updateRenderStatus(db, prId, annSongId, "failed", undefined, "Missing video_url");
        continue;
      }

      // Update status to rendering
      await updateRenderStatus(db, prId, annSongId, "rendering");

      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[worker] Rendering ${annSongId} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
          const videoPath = await renderSingleSong(prId, annSongId, songData, videoCdnPrefix, outputDir);
          await updateRenderStatus(db, prId, annSongId, "done", videoPath);
          console.log(`[worker] Done: ${videoPath}`);
          break;
        } catch (err) {
          lastError = err as Error;
          console.error(`[worker] Render failed (attempt ${attempt + 1}):`, err);
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 5000)); // Wait 5s before retry
          }
        }
      }

      if (lastError) {
        await updateRenderStatus(db, prId, annSongId, "failed", undefined, lastError.message);
      }
    }
  } finally {
    await db.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[worker] DATABASE_URL not set");
    process.exit(1);
  }

  const boss = new PgBoss(connectionString);
  await boss.start();

  console.log("[worker] Started, waiting for jobs...");

  await boss.work<VideoRenderJob>(QUEUE_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        console.error("[worker] Job processing failed:", err);
        throw err; // Let pg-boss handle retry
      }
    }
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[worker] Shutting down...");
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});