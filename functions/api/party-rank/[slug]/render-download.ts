import { Client } from "pg";
import { createRequire } from "module";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
  // For local file serving in development
  RENDER_OUTPUT_DIR?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string; annSongId: string };
  request: Request;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });

const getClient = (env: Env) =>
  new Client({ connectionString: env.DB.connectionString });

// ----------------------------------------------------------------
// GET /[slug]/render-download/:annSongId
// Serves the rendered MP4 file
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params } = context;
  const { slug: pr, annSongId: annSongIdStr } = params;
  const annSongId = parseInt(annSongIdStr, 10);
  if (isNaN(annSongId)) return json({ error: "Invalid ann_song_id." }, 400);

  const client = getClient(env);
  await client.connect();

  try {
    // Get party rank id
    const prRes = await client.query(`SELECT id FROM party_ranks WHERE slug = $1`, [pr]);
    if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
    const prId = prRes.rows[0].id;

    // Get render record
    const renderRes = await client.query(
      `SELECT video_path, status FROM renders WHERE pr_id = $1 AND ann_song_id = $2`,
      [prId, annSongId]
    );
    if (renderRes.rowCount === 0) return json({ error: "Render not found." }, 404);

    const { video_path: videoPath, status } = renderRes.rows[0];
    if (status !== "done" || !videoPath) {
      return json({ error: "Video not ready.", status }, 400);
    }

    // Resolve file path
    // In production, this would be served from object storage (R2/S3)
    // For now, serve from local filesystem
    const outputDir = env.RENDER_OUTPUT_DIR || path.join(process.cwd(), "apps/render/out");
    const filePath = path.join(outputDir, videoPath);

    if (!fs.existsSync(filePath)) {
      console.error("[render-download] File not found:", filePath);
      return json({ error: "Video file not found on disk." }, 404);
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    // Convert Node.js stream to Web ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size.toString(),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `attachment; filename="${pr}-${annSongId}.mp4"`,
      },
    });
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------
export const onRequest = async (context: EventContext) => {
  const { request, params } = context;
  const method = request.method.toUpperCase();
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const res = await handleGet(context);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error("[render-download] error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};