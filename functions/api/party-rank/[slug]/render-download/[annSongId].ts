import { Client } from "pg";
import { resolveAuthUser } from "../../../../lib/clerk";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
  RENDER_WORKER_URL?: string;
  BOT_SECRET?: string;
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
// Returns download URL pointing to render worker
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params } = context;
  const { slug: pr, annSongId: annSongIdStr } = params;
  const annSongId = parseInt(annSongIdStr, 10);
  if (isNaN(annSongId)) return json({ error: "Invalid ann_song_id." }, 400);

  const client = getClient(env);
  await client.connect();

  try {
    const prRes = await client.query(`SELECT id FROM party_ranks WHERE slug = $1`, [pr]);
    if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
    const prId = prRes.rows[0].id;

    const renderRes = await client.query(
      `SELECT video_path, status FROM renders WHERE pr_id = $1 AND ann_song_id = $2`,
      [prId, annSongId]
    );
    if (renderRes.rowCount === 0) return json({ error: "Render not found." }, 404);

    const { video_path: videoPath, status } = renderRes.rows[0];
    if (status !== "done" || !videoPath) {
      return json({ error: "Video not ready.", status }, 400);
    }

    // Return download URL pointing to render worker
    const workerUrl = env.RENDER_WORKER_URL || "http://localhost:3001";
    const downloadUrl = `${workerUrl}/download/${prId}/${videoPath}`;

    return json({
      downloadUrl,
      filename: `${prId}-${annSongId}.mp4`,
    });
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------
export const onRequest = async (context: EventContext) => {
  const { request, env } = context;
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

  // Host-only: authenticate via Clerk session (or BOT_SECRET for the render worker)
  const authUser = await resolveAuthUser(request, env);
  if (!authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
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