import { PgBoss, Job } from "pg-boss";
import { renderMedia, selectComposition, makeCancelSignal } from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { Client } from "pg";
import { createServer } from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface VideoRenderJob {
  prId: string;
  slug: string;
  songIds: number[];
}

const QUEUE_NAME = "video-render";
const RENDER_TIMEOUT_MS = 60000;
const MAX_RETRIES = 1;
const WORKER_PORT = parseInt(process.env.WORKER_PORT || "3001", 10);
const WORKER_SECRET = process.env.WORKER_SECRET || process.env.BOT_SECRET || "";

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

async function fetchRenderData(apiUrl: string, slug: string): Promise<any[]> {
  const response = await fetch(`${apiUrl}/api/party-rank/${slug}/render-data`, {
    headers: { Authorization: `Bearer ${process.env.BOT_SECRET || process.env.WORKER_SECRET || ""}` },
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

  const bundlePath = await bundle({ entryPoint: path.join(__dirname, "src/index.ts") });
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: compositionId,
    inputProps: { songData, videoCdnPrefix },
  });

  // Render with timeout so a stuck render doesn't block the queue forever
  const { cancelSignal, cancel } = makeCancelSignal();
  const timeout = setTimeout(() => cancel(), RENDER_TIMEOUT_MS);

  try {
    await renderMedia({
      composition,
      serveUrl: bundlePath,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { songData, videoCdnPrefix },
      cancelSignal,
    });
  } finally {
    clearTimeout(timeout);
  }

  return outputFileName;
}

async function processJob(job: Job<VideoRenderJob>) {
  const { prId, slug, songIds } = job.data;
  console.log(`[worker] Processing job for PR ${prId} (${slug}), songs: ${songIds.join(", ")}`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const apiUrl = process.env.APP_URL || "http://localhost:8788";
  const videoCdnPrefix = process.env.VIDEO_CDN_PREFIX || "";
  const outputDir = path.join(__dirname, "out", prId);

  try {
    // Fetch render data for all songs
    const renderDataArray = await fetchRenderData(apiUrl, slug);
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

  // Start HTTP server for enqueue endpoint
  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/enqueue") {
      // Verify auth
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace("Bearer ", "");
      if (WORKER_SECRET && token !== WORKER_SECRET) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }

      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const job = JSON.parse(body);
        const boss = new PgBoss(process.env.DATABASE_URL!);
        await boss.start();
        const jobId = await boss.send("video-render", job, {
          retryLimit: 1,
          retryDelay: 30000,
          priority: 0,
        });
        await boss.stop();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, jobId }));
      } catch (err) {
        console.error("[worker] Enqueue error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Enqueue failed" }));
      }
      return;
    }

    // Download endpoint: /download/{prId}/{filename}
    if (req.method === "GET" && req.url?.startsWith("/download/")) {
      try {
        const url = new URL(req.url, `http://localhost:${WORKER_PORT}`);
        const parts = url.pathname.split("/");
        if (parts.length >= 4) {
          const prId = parts[2];
          const filename = parts.slice(3).join("/");
          const outRoot = path.resolve(__dirname, "out");
          const filePath = path.resolve(outRoot, prId, filename);

          // Path traversal guard
          if (!filePath.startsWith(outRoot + path.sep)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid path" }));
            return;
          }

          if (!fs.existsSync(filePath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "File not found" }));
            return;
          }

          const stat = fs.statSync(filePath);
          const fileStream = fs.createReadStream(filePath);

          res.writeHead(200, {
            "Content-Type": "video/mp4",
            "Content-Length": stat.size.toString(),
            "Accept-Ranges": "bytes",
            "Content-Disposition": `attachment; filename="${filename}"`,
          });

          fileStream.pipe(res);
          return;
        }
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid path" }));
        return;
      }
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(WORKER_PORT, () => {
    console.log(`[worker] HTTP server listening on port ${WORKER_PORT}`);
  });

  const boss = new PgBoss(process.env.DATABASE_URL || connectionString);
  await boss.start();

  console.log("[worker] Started, waiting for jobs...");

  await boss.work<VideoRenderJob>(QUEUE_NAME, { localConcurrency: 1 }, async (jobs) => {
    for (const job of jobs) {
      try {
        await processJob(job);
      } catch (err) {
        console.error("[worker] Job processing failed:", err);
        throw err;
      }
    }
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("[worker] Shutting down...");
    server.close();
    await boss.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});