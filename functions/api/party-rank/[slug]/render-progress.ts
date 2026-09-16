import { Client } from "pg";
import { resolveAuthUser } from "../../../lib/clerk";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
  BOT_SECRET?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string };
  request: Request;
}

interface RenderProgressItem {
  annSongId: number;
  status: "pending" | "rendering" | "done" | "failed";
  videoPath: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RenderProgressResponse {
  done: number;
  total: number;
  items: RenderProgressItem[];
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
// GET /[slug]/render-progress
// Returns render progress for all songs in a party rank
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params } = context;
  const { slug: pr } = params;
  const client = getClient(env);
  await client.connect();

  try {
    // Get party rank id
    const prRes = await client.query(`SELECT id FROM party_ranks WHERE slug = $1`, [pr]);
    if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
    const prId = prRes.rows[0].id;

    // Get render status for all songs in this PR
    const rendersRes = await client.query(
      `SELECT ann_song_id, status, video_path, error, created_at, updated_at
       FROM renders
       WHERE pr_id = $1
       ORDER BY created_at ASC`,
      [prId]
    );

    const items: RenderProgressItem[] = rendersRes.rows.map((r) => ({
      annSongId: r.ann_song_id,
      status: r.status,
      videoPath: r.video_path,
      error: r.error,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    const done = items.filter((i) => i.status === "done").length;
    const total = items.length;

    return json({ done, total, items } as RenderProgressResponse, 200);
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------
export const onRequest = async (context: EventContext) => {
  const { request, env, params } = context;
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
    console.error("[render-progress] error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};