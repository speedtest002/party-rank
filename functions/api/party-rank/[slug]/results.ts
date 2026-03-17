import { Client } from "pg";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
}

interface EventContext {
  env: Env;
  params: { slug: string };
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
// GET /[pr]/results
// Public — không cần auth
// Chỉ trả data khi status = 'revealed'
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params } = context;
  const { slug: pr } = params;
  const client = getClient(env);
  await client.connect();

  try {
    // 1. Lấy thông tin PR — dùng fallback nếu thiếu cột discord metadata mới
    let partyRank: any;
    try {
      const prRes = await client.query(
        `SELECT id, slug, name, description, cover_url,
                spotify_url, youtube_url,
                starts_at, deadline, closed_at, status,
                discord_guild_id, discord_thread_id
         FROM party_ranks
         WHERE slug = $1`,
        [pr]
      );
      if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
      partyRank = prRes.rows[0];
    } catch (err: any) {
      if (err.code === '42703') { // undefined_column
        const prRes = await client.query(
          `SELECT id, slug, name, description, cover_url,
                  spotify_url, youtube_url,
                  starts_at, deadline, closed_at, status
           FROM party_ranks
           WHERE slug = $1`,
          [pr]
        );
        if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
        partyRank = prRes.rows[0];
      } else {
        throw err;
      }
    }

    // 2. Nếu chưa revealed, trả về metadata nhưng không có results
    if (partyRank.status !== "revealed") {
      return json(
        {
          partyRank: {
            slug:        partyRank.slug,
            name:        partyRank.name,
            description: partyRank.description,
            cover_url:   partyRank.cover_url,
            status:      partyRank.status,
            starts_at:   partyRank.starts_at,
            deadline:    partyRank.deadline,
            discord_guild_id: partyRank.discord_guild_id,
            discord_thread_id: partyRank.discord_thread_id,
          },
          summary: null,
          results: [],
          breakdown: {},
        },
        200,
        { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" }
      );
    }

    // 3. Bảng xếp hạng — cast rõ kiểu, không SELECT *
    const resultsRes = await client.query(
      `SELECT ann_song_id, ann_id, anime, song_title, artist, song_type, position,
              vote_count::int,
              avg_score::float,
              avg_rank::float,
              min_score::float,
              max_score::float,
              final_rank::int
       FROM song_results
       WHERE pr_id = $1
       ORDER BY final_rank ASC, position ASC`,
      [partyRank.id]
    );

    // 4. Breakdown public — ai chấm bài nào bao nhiêu điểm
    // Chỉ hiện sau khi revealed để tránh lộ điểm khi đang chấm
    const breakdownRes = await client.query(
      `SELECT sc.ann_song_id,
              sc.rank,
              sc.score::float,
              p.discord_id,
              p.discord_username,
              p.discord_avatar
       FROM scores sc
       JOIN participants p ON p.id = sc.participant_id
       WHERE sc.pr_id = $1
       ORDER BY sc.ann_song_id, sc.rank ASC`,
      [partyRank.id]
    );

    // Group breakdown theo ann_song_id
    const breakdown: Record<
      number,
      { discord_id: string; discord_username: string; discord_avatar: string | null; rank: number; score: number }[]
    > = {};
    for (const row of breakdownRes.rows) {
      if (!breakdown[row.ann_song_id]) breakdown[row.ann_song_id] = [];
      breakdown[row.ann_song_id].push({
        discord_id:       row.discord_id,
        discord_username: row.discord_username,
        discord_avatar:   row.discord_avatar,
        rank:             row.rank,
        score:            row.score,
      });
    }

    // 5. Thống kê tóm tắt
    const songs = resultsRes.rows;
    const scores = songs.map((s) => s.avg_score).filter((s) => s !== null);
    const summary = {
      total_songs:        songs.length,
      total_participants: breakdownRes.rows.length > 0
        ? new Set(breakdownRes.rows.map((r) => r.discord_id)).size
        : 0,
      highest_avg:   scores.length ? Math.max(...scores) : null,
      lowest_avg:    scores.length ? Math.min(...scores) : null,
    };

    return json(
      {
        partyRank: {
          slug:        partyRank.slug,
          name:        partyRank.name,
          description: partyRank.description,
          cover_url:   partyRank.cover_url,
          spotify_url: partyRank.spotify_url,
          youtube_url: partyRank.youtube_url,
          starts_at:   partyRank.starts_at,
          deadline:    partyRank.deadline,
          closed_at:   partyRank.closed_at,
          status:      partyRank.status,
          discord_guild_id: partyRank.discord_guild_id,
          discord_thread_id: partyRank.discord_thread_id,
        },
        summary,
        results:   resultsRes.rows,
        breakdown,
      },
      200,
      { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" }
    );
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler — GET only, không cần auth
// ----------------------------------------------------------------
export const onRequest = async (context: EventContext) => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const { slug: pr } = params;
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
    console.error("[results].ts error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};