import { Client } from "pg";
import { resolveAuthUser } from "../../../lib/clerk";

interface Env {
  DB: { connectionString: string };
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  BOT_SECRET?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string };
  request: Request;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const getClient = (env: Env) =>
  new Client({ connectionString: env.DB.connectionString });

export const onRequest = async (context: EventContext) => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const { slug: pr } = params;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const userDiscordId = await resolveAuthUser(request, env);
  if (!userDiscordId) {
    return new Response(JSON.stringify({ error: "Unauthorized.", canManage: false }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const client = getClient(env);
  await client.connect();
  try {
    const checkRes = await client.query(
      `SELECT pr.created_by_discord_id, u.role FROM party_ranks pr LEFT JOIN users u ON u.discord_id = $2 WHERE pr.slug = $1`,
      [pr, userDiscordId]
    );

    if (checkRes.rowCount === 0) {
      return json({ canManage: false, exists: false });
    }

    const { created_by_discord_id, role } = checkRes.rows[0];
    const isOwner = created_by_discord_id === userDiscordId;
    const isAdmin = role === "admin";

    return json({ canManage: isOwner || isAdmin, exists: true });
  } catch (err) {
    console.error("[can-master] error:", err);
    return json({ canManage: false }, 500);
  } finally {
    await client.end();
  }
};