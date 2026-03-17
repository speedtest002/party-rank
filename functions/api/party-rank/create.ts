import { Client } from "pg";
import { verifyToken, createClerkClient } from "@clerk/backend";

interface Env {
  DB: { connectionString: string };
  CLERK_SECRET_KEY: string;
  BOT_SECRET?: string; // Secret for Discord bot auth
}

interface AuthResult {
  discord_id: string | null;
  is_bot: boolean;
}

interface EventContext {
  env: Env;
  request: Request;
}

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });

const getClient = (env: Env) =>
  new Client({ connectionString: env.DB.connectionString });

async function authUser(request: Request, env: Env): Promise<AuthResult> {
  const header = request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return { discord_id: null, is_bot: false };

  // 1. Check Bot Secret first (if configured)
  if (env.BOT_SECRET && token === env.BOT_SECRET) {
    return { discord_id: "BOT", is_bot: true }; // "BOT" placeholder, will use body.created_by_discord_id
  }

  // 2. Fallback to Clerk JWT
  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    if (!payload.sub) return { discord_id: null, is_bot: false };

    const clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
    const user = await clerkClient.users.getUser(payload.sub);
    const discordAccount = user.externalAccounts.find(
      (a: any) => a.provider === "discord" || a.provider === "oauth_discord"
    );
    
    return { discord_id: discordAccount?.externalId ?? null, is_bot: false };
  } catch {
    return { discord_id: null, is_bot: false };
  }
}

export const onRequest = async (context: EventContext) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const { discord_id, is_bot } = await authUser(request, env);
  if (!discord_id) {
    return json({ error: "Unauthorized." }, 401);
  }

  try {
    const body: any = await request.json();
    const { 
      slug, name, description, 
      score_min, score_max, 
      created_by_discord_id,
      deadline,
      discord_guild_id,
      discord_channel_id,
      discord_thread_id,
      discord_message_id
    } = body;

    if (!slug || !name) {
      return json({ error: "Slug và tên là bắt buộc." }, 400);
    }

    // Determine the owner: if bot, must provide target user's discord_id
    const finalOwnerId = is_bot ? created_by_discord_id : discord_id;
    if (!finalOwnerId) {
      return json({ error: "Missing created_by_discord_id." }, 400);
    }

    const client = getClient(env);
    await client.connect();

    try {
      // 1. Ensure owner exists in 'users' table (FIX for FK Violation)
      await client.query(
        `INSERT INTO users (discord_id, last_login_at)
         VALUES ($1, NOW())
         ON CONFLICT (discord_id) DO UPDATE SET
           last_login_at = EXCLUDED.last_login_at`,
        [finalOwnerId]
      );

      // 2. Insert the Party Rank
      const res = await client.query(
        `INSERT INTO party_ranks (
          slug, name, description, created_by_discord_id, 
          score_min, score_max, deadline,
          discord_guild_id, discord_channel_id, discord_thread_id, discord_message_id
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          slug, 
          name, 
          description ?? null, 
          finalOwnerId, 
          score_min ?? 0, 
          score_max ?? 10,
          deadline ?? null,
          discord_guild_id ?? null,
          discord_channel_id ?? null,
          discord_thread_id ?? null,
          discord_message_id ?? null
        ]
      );
      return json({ ok: true, partyRank: res.rows[0] });
    } catch (err: any) {
      if (err.code === "23505") { // unique_violation
        return json({ error: "Slug này đã tồn tại." }, 409);
      }
      throw err;
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error("Create PR error:", err);
    return json({ error: "Lỗi server." }, 500);
  }
};
