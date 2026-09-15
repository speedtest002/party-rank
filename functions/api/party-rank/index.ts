import { Client } from "pg";

interface Env {
  DB: { connectionString: string };
}

interface EventContext {
  env: Env;
  request: Request;
}

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });

async function handleGet(context: EventContext) {
  const { env } = context;
  const client = new Client({ connectionString: env.DB.connectionString });
  await client.connect();

  try {
    // Fetch non-draft party ranks
    const { rows } = await client.query(`
      SELECT slug, name, description, cover_url, status, starts_at, deadline, closed_at, max_participants
      FROM party_ranks
      WHERE status != 'draft'
      ORDER BY starts_at DESC NULLS LAST, created_at DESC
    `);
    
    // Add Cache-Control for performance (60s)
    return json({ partyRanks: rows }, 200, {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120"
    });
  } catch (err: any) {
    console.error("Database query error:", err);
    throw err;
  } finally {
    await client.end();
  }
}

export const onRequest = async (context: EventContext) => {
  const method = context.request.method.toUpperCase();
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
    console.error("[index].ts error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};
