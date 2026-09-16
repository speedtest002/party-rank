import { Client } from "pg";
import { resolveAuthUser } from "../../../lib/clerk";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB:         { connectionString: string };  // partyrank DB
  ANISONG_DB: { connectionString: string };  // anisongdb (read-only)
  APP_URL: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  WORKER_SECRET?: string;
  BOT_SECRET?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string };
  request: Request;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const getClient = (env: Env) =>
  new Client({ connectionString: env.DB.connectionString });

const getAnisongClient = (env: Env) =>
  new Client({ connectionString: env.ANISONG_DB.connectionString });

/**
 * Verify Clerk session or BOT_SECRET and resolve the Discord ID.
 * Returns Discord ID if valid, null otherwise.
 */
const authMaster = async (request: Request, env: Env): Promise<string | null> => {
  return resolveAuthUser(request, env);
};

// ----------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------

async function handleGet(context: EventContext, client: Client) {
  const { params } = context;
  const { slug: pr } = params;

  // 1. Lấy thông tin PR
  const prRes = await client.query(
    `SELECT id, slug, name, description, cover_url,
            spotify_url, youtube_url,
            status, starts_at, deadline, closed_at,
            allow_resubmit, max_participants,
            score_min::float, score_max::float,
            discord_guild_id, discord_thread_id,
            discord_channel_id, discord_message_id
     FROM party_ranks
     WHERE slug = $1`,
    [pr]
  );
  if (prRes.rowCount === 0) return json({ error: "Party Rank không tồn tại." }, 404);
  const partyRank = prRes.rows[0];

  // 2. Danh sách participants
  const participantsRes = await client.query(
    `SELECT id, discord_id, discord_username, discord_avatar,
            status, invited_at, first_viewed_at, submitted_at, submit_count,
            token
     FROM participants
     WHERE pr_id = $1
     ORDER BY invited_at ASC`,
    [partyRank.id]
  );

  // 3. Tóm tắt tiến độ
  const progress = {
    total:     participantsRes.rowCount ?? 0,
    submitted: participantsRes.rows.filter((p) => p.status === "submitted").length,
    viewed:    participantsRes.rows.filter((p) => p.status === "viewed").length,
    invited:   participantsRes.rows.filter((p) => p.status === "invited").length,
  };

  // 4. Kết quả tổng hợp
  const resultsRes = await client.query(
    `SELECT sr.ann_song_id, sr.pr_id, sr.ann_id, sr.anime, sr.song_title, sr.artist, sr.song_type, sr.position,
            sr.vote_count::int, sr.avg_score::float, sr.avg_rank::float, sr.min_score::float, sr.max_score::float, sr.final_rank::int,
            s.clip_start_seconds, s.clip_duration_seconds, s.video_url, s.audio_url
     FROM song_results sr
     JOIN songs s ON s.pr_id = sr.pr_id AND s.ann_song_id = sr.ann_song_id
     WHERE sr.pr_id = $1
     ORDER BY sr.final_rank ASC, sr.position ASC`,
    [partyRank.id]
  );

  // 5. Breakdown
  const breakdownRes = await client.query(
    `SELECT sc.ann_song_id, sc.rank, sc.score::float, p.discord_username, p.discord_id
     FROM scores sc
     JOIN participants p ON p.id = sc.participant_id
     WHERE sc.pr_id = $1`,
    [partyRank.id]
  );

  const breakdown: Record<number, any[]> = {};
  for (const row of breakdownRes.rows) {
    if (!breakdown[row.ann_song_id]) breakdown[row.ann_song_id] = [];
    breakdown[row.ann_song_id].push({
      discord_username: row.discord_username,
      discord_id:       row.discord_id,
      rank:             row.rank,
      score:            row.score,
    });
  }

  return json({
    partyRank,
    progress,
    participants: participantsRes.rows,
    results:      resultsRes.rows,
    breakdown,
  });
}

async function handlePatch(context: EventContext, client: Client) {
  const { params, request, env } = context;
  const { slug: pr } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Body không hợp lệ." }, 400); }

  const { action, data } = body;
  const prRes = await client.query(`SELECT id, status FROM party_ranks WHERE slug = $1`, [pr]);
  if (prRes.rowCount === 0) return json({ error: "Party Rank không tồn tại." }, 404);
  const { id: prId, status: currentStatus } = prRes.rows[0];

  if (action === "open") {
    if (currentStatus !== "draft") return json({ error: "Không thể open." }, 400);
    await client.query(`UPDATE party_ranks SET status = 'open' WHERE id = $1`, [prId]);
    return json({ ok: true, status: "open" });
  }

  if (action === "close") {
    if (currentStatus !== "open") return json({ error: "Không thể close." }, 400);
    await client.query(`UPDATE party_ranks SET status = 'closed', closed_at = NOW() WHERE id = $1`, [prId]);
    return json({ ok: true, status: "closed" });
  }

  if (action === "reveal") {
    if (currentStatus !== "closed") return json({ error: "Chỉ có thể reveal sau khi đã closed." }, 400);

    const songsRes = await client.query(
      `SELECT ann_song_id FROM songs WHERE pr_id = $1 ORDER BY position ASC`,
      [prId]
    );
    const songIds = songsRes.rows.map((r: any) => r.ann_song_id);

    await client.query(`UPDATE party_ranks SET status = 'revealed' WHERE id = $1`, [prId]);

    return json({ ok: true, status: "revealed", songIds });
  }

  if (action === "update_song") {
    if (!data || !data.ann_song_id) return json({ error: "Thiếu ann_song_id." }, 400);
    const { ann_song_id, clip_start_seconds, clip_duration_seconds } = data;
    const allowed = ["clip_start_seconds", "clip_duration_seconds"];
    const fields = Object.keys(data).filter((k) => allowed.includes(k));
    if (fields.length === 0) return json({ error: "Không có field hợp lệ." }, 400);

    const clauses = fields.map((f, i) => `${f} = $${i + 3}`).join(", ");
    try {
      await client.query(
        `UPDATE songs SET ${clauses} WHERE pr_id = $1 AND ann_song_id = $2`,
        [prId, ann_song_id, ...fields.map((f) => data[f])]
      );
      return json({ ok: true, updated: fields });
    } catch (err: any) {
      if (err.code === "23514") return json({ error: "Giá trị không hợp lệ (vi phạm ràng buộc)." }, 400);
      throw err;
    }
  }

  if (action === "update") {
    if (!data) return json({ error: "Thiếu data." }, 400);
    const allowed = ["name", "description", "cover_url", "spotify_url", "youtube_url", "starts_at", "deadline", "allow_resubmit", "max_participants", "score_min", "score_max"];
    const fields = Object.keys(data).filter((k) => allowed.includes(k));
    if (fields.length === 0) return json({ error: "Không có field hợp lệ." }, 400);

    const clauses = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
    try {
      await client.query(`UPDATE party_ranks SET ${clauses} WHERE id = $1`, [prId, ...fields.map((f) => data[f])]);
      return json({ ok: true, updated: fields });
    } catch (err: any) {
      if (err.code === "23514") return json({ error: "Giá trị không hợp lệ (vi phạm ràng buộc)." }, 400);
      throw err;
    }
  }

  return json({ error: "Action không hợp lệ." }, 400);
}

async function handlePost(context: EventContext, client: Client) {
  const { env, params, request } = context;
  const { slug: pr } = params;

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Body không hợp lệ." }, 400); }

  const prRes = await client.query(`SELECT id, status, max_participants FROM party_ranks WHERE slug = $1`, [pr]);
  if (prRes.rowCount === 0) return json({ error: "Party Rank không tồn tại." }, 404);
  const { id: prId, status, max_participants } = prRes.rows[0];

  if (body.action === "add") {
    const { discord_id, discord_username, discord_avatar } = body;
    if (!discord_id) return json({ error: "Thiếu discord_id." }, 400);
    if (status === "closed" || status === "revealed") return json({ error: "Phiên đã đóng." }, 400);

    if (max_participants) {
      const countRes = await client.query(`SELECT COUNT(*) FROM participants WHERE pr_id = $1`, [prId]);
      if (parseInt(countRes.rows[0].count) >= max_participants) return json({ error: "Đã đạt giới hạn người tham gia." }, 400);
    }

    // Ensure user exists in 'users' table to avoid FK issues later
    await client.query(
      `INSERT INTO users (discord_id, discord_username, discord_avatar)
       VALUES ($1, $2, $3)
       ON CONFLICT (discord_id) DO UPDATE SET
         discord_username = COALESCE(EXCLUDED.discord_username, users.discord_username),
         discord_avatar   = COALESCE(EXCLUDED.discord_avatar, users.discord_avatar)`,
      [discord_id, discord_username ?? null, discord_avatar ?? null]
    );

    const insertRes = await client.query(
      `INSERT INTO participants (pr_id, discord_id, discord_username, discord_avatar)
       VALUES ($1, $2, $3, $4) ON CONFLICT (pr_id, discord_id) DO NOTHING RETURNING id, token`,
      [prId, discord_id, discord_username ?? null, discord_avatar ?? null]
    );
    if (insertRes.rowCount === 0) return json({ error: "Participant đã tồn tại." }, 409);
    return json({ ok: true, ...insertRes.rows[0] });
  }

  if (body.action === "remove") {
    const { participant_id } = body;
    if (!participant_id) return json({ error: "Thiếu participant_id." }, 400);
    const deleteRes = await client.query(`DELETE FROM participants WHERE id = $1 AND pr_id = $2 RETURNING id`, [participant_id, prId]);
    if (deleteRes.rowCount === 0) return json({ error: "Không tìm thấy participant." }, 404);
    return json({ ok: true, deleted: participant_id });
  }

  if (body.action === "add_song") {
    const ids = Array.isArray(body.ann_song_ids) ? body.ann_song_ids : [body.ann_song_ids];
    if (!ids.length) return json({ error: "Thiếu ann_song_ids." }, 400);
    if (status === "closed" || status === "revealed") return json({ error: "Phiên đã đóng." }, 400);

    const anisongClient = getAnisongClient(env);
    await anisongClient.connect();
    let rows: any[];
    try {
      const anisongRes = await anisongClient.query(
        `SELECT sl.ann_song_id, sl.ann_id, sl.song_id, sl.type AS song_type, s.name AS song_title,
                COALESCE(a.name, g.name) AS artist, su.audio AS audio_url, COALESCE(su.hq, su.mq) AS video_url,
                MAX(an.name) FILTER (WHERE UPPER(an.language) = 'EN') AS anime_en,
                MAX(an.name) FILTER (WHERE UPPER(an.language) = 'JA') AS anime_ja
         FROM song_link sl JOIN song s ON s.song_id = sl.song_id
         LEFT JOIN artist a ON a.artist_id = s.song_artist_id
         LEFT JOIN "groups" g ON g.group_id = s.song_group_id
         LEFT JOIN anime_name an ON an.ann_id = sl.ann_id AND an.is_main = TRUE AND UPPER(an.language) IN ('EN', 'JA')
         LEFT JOIN song_urls su ON su.ann_song_id = sl.ann_song_id
         WHERE sl.ann_song_id = ANY($1::int[]) AND sl.is_deleted = FALSE AND s.is_deleted = FALSE
         GROUP BY sl.ann_song_id, sl.ann_id, sl.song_id, sl.type, s.name, a.name, g.name, su.audio, su.hq, su.mq`,
        [ids]
      );
      rows = anisongRes.rows;
    } finally { await anisongClient.end(); }

    const foundIds = new Set(rows.map((r) => r.ann_song_id));
    const notFound = ids.filter((id: number) => !foundIds.has(id));
    if (notFound.length) return json({ error: `Không tìm thấy ids: ${notFound.join(", ")}` }, 404);

    const posRes = await client.query(`SELECT COALESCE(MAX(position), 0) AS max_pos FROM songs WHERE pr_id = $1`, [prId]);
    let nextPos = posRes.rows[0].max_pos;

    await client.query(
      `INSERT INTO songs (pr_id, position, ann_song_id, ann_id, song_id, anime, song_title, artist, song_type, audio_url, video_url)
       SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::int[]), unnest($5::int[]), unnest($6::text[]), unnest($7::text[]), unnest($8::text[]), unnest($9::smallint[]), unnest($10::text[]), unnest($11::text[])`,
      [prId, rows.map(() => ++nextPos), rows.map(r => r.ann_song_id), rows.map(r => r.ann_id), rows.map(r => r.song_id), rows.map(r => r.anime_ja ?? r.anime_en ?? "Unknown"), rows.map(r => r.song_title), rows.map(r => r.artist ?? null), rows.map(r => Number(r.song_type)), rows.map(r => r.audio_url ?? null), rows.map(r => r.video_url ?? null)]
    );
    return json({ ok: true, added: rows.length });
  }

  if (body.action === "remove_song") {
    const ids = Array.isArray(body.ann_song_ids) ? body.ann_song_ids : [body.ann_song_ids];
    if (!ids.length) return json({ error: "Thiếu ids." }, 400);
    const delRes = await client.query(`DELETE FROM songs WHERE ann_song_id = ANY($1::int[]) AND pr_id = $2 RETURNING ann_song_id`, [ids, prId]);
    return json({ ok: true, deleted: delRes.rows.map(r => r.ann_song_id) });
  }

  return json({ error: "Action không hợp lệ." }, 400);
}

// ----------------------------------------------------------------
// Main Entry
// ----------------------------------------------------------------

export const onRequest = async (context: EventContext) => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const { slug: prSlug } = params;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // 1. Auth & Sync User
  const userDiscordId = await authMaster(request, env);
  if (!userDiscordId) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // 2. Check Ownership or Admin
  const client = getClient(env);
  await client.connect();
  try {
    const checkRes = await client.query(
      `SELECT pr.created_by_discord_id, u.role FROM party_ranks pr LEFT JOIN users u ON u.discord_id = $2 WHERE pr.slug = $1`,
      [prSlug, userDiscordId]
    );

    if (checkRes.rowCount === 0) {
      return new Response(JSON.stringify({ error: "Party Rank không tồn tại." }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { created_by_discord_id, role } = checkRes.rows[0];
    const isOwner = created_by_discord_id === userDiscordId;
    const isAdmin = role === "admin";
    const isBot   = userDiscordId === "BOT";

    if (!isOwner && !isAdmin && !isBot) {
      return new Response(JSON.stringify({ error: "Forbidden: Bạn không sở hữu Party Rank này." }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let response: Response;
    if (method === "GET") response = await handleGet(context, client);
    else if (method === "PATCH") response = await handlePatch(context, client);
    else if (method === "POST") response = await handlePost(context, client);
    else response = new Response("Method not allowed", { status: 405 });

    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  } catch (err) {
    console.error("[master] Fatal Error:", err);
    return new Response(JSON.stringify({ error: "Lỗi hệ thống." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  } finally {
    await client.end();
  }
};
