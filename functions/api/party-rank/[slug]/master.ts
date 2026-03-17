import { Client } from "pg";
import { verifyToken } from "@clerk/backend";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB:         { connectionString: string };  // partyrank DB
  ANISONG_DB: { connectionString: string };  // anisongdb (read-only)
  CLERK_SECRET_KEY: string;
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

// Verify token từ Authorization header bằng Clerk
const authMaster = async (request: Request, env: Env): Promise<boolean> => {
  const header = request.headers.get("Authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    return !!payload.sub; // Valid if there's a subject
  } catch (err) {
    console.error("JWT verification failed:", err);
    return false;
  }
};

// ----------------------------------------------------------------
// GET /[pr]/master
// Trả về: thông tin PR, tiến độ participants, kết quả tổng hợp
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
      partyRank = prRes.rows[0];
    } catch (err: any) {
      if (err.code === '42703') { // undefined_column
        const prRes = await client.query(
          `SELECT id, slug, name, description, cover_url,
                  spotify_url, youtube_url,
                  status, starts_at, deadline, closed_at,
                  allow_resubmit, max_participants,
                  score_min::float, score_max::float
           FROM party_ranks
           WHERE slug = $1`,
          [pr]
        );
        if (prRes.rowCount === 0) return json({ error: "Party Rank không tồn tại." }, 404);
        partyRank = prRes.rows[0];
      } else {
        throw err;
      }
    }

    // 2. Danh sách participants + trạng thái
    const participantsRes = await client.query(
      `SELECT id, discord_id, discord_username, discord_avatar,
              status, invited_at, first_viewed_at, submitted_at, submit_count,
              -- Sinh lại link token để master copy
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

    // 4. Kết quả tổng hợp (chỉ tính từ người đã submitted)
    // Fix: Không dùng SELECT * — cast rõ kiểu để pg không trả string cho BIGINT/NUMERIC
    const resultsRes = await client.query(
      `SELECT ann_song_id, pr_id, ann_id, anime, song_title, artist, song_type, position,
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

    // 5. Breakdown điểm từng participant cho từng bài
    const breakdownRes = await client.query(
      `SELECT sc.ann_song_id, sc.rank, sc.score::float,
              p.discord_username, p.discord_id
       FROM scores sc
       JOIN participants p ON p.id = sc.participant_id
       WHERE sc.pr_id = $1`,
      [partyRank.id]
    );

    // Group breakdown theo ann_song_id
    const breakdown: Record<number, { discord_username: string; discord_id: string; rank: number; score: number }[]> = {};
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
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// PATCH /[pr]/master
// Cập nhật trạng thái PR hoặc thông tin
// Body:
//   { action: "open" }                        → draft → open
//   { action: "close" }                       → open  → closed  (manual)
//   { action: "reveal" }                      → closed → revealed
//   { action: "update", data: { ...fields } } → cập nhật metadata
// ----------------------------------------------------------------
async function handlePatch(context: EventContext) {
  const { env, params, request } = context;
  const { slug: pr } = params;

  let body: { action: string; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body không hợp lệ." }, 400);
  }

  const { action, data } = body;
  const client = getClient(env);
  await client.connect();

  try {
    // Lấy PR hiện tại
    const prRes = await client.query(
      `SELECT id, status FROM party_ranks WHERE slug = $1`,
      [pr]
    );

    if (prRes.rowCount === 0) {
      return json({ error: "Party Rank không tồn tại." }, 404);
    }

    const { id: prId, status: currentStatus } = prRes.rows[0];

    // --- Xử lý từng action ---
    if (action === "open") {
      if (currentStatus !== "draft") {
        return json({ error: `Không thể open từ trạng thái "${currentStatus}".` }, 400);
      }
      await client.query(
        `UPDATE party_ranks SET status = 'open' WHERE id = $1`,
        [prId]
      );
      return json({ ok: true, status: "open" });
    }

    if (action === "close") {
      if (currentStatus !== "open") {
        return json({ error: `Không thể close từ trạng thái "${currentStatus}".` }, 400);
      }
      await client.query(
        `UPDATE party_ranks
         SET status = 'closed', closed_at = NOW()
         WHERE id = $1`,
        [prId]
      );
      return json({ ok: true, status: "closed" });
    }

    if (action === "reveal") {
      if (currentStatus !== "closed") {
        return json({ error: `Chỉ có thể reveal sau khi đã closed.` }, 400);
      }
      await client.query(
        `UPDATE party_ranks SET status = 'revealed' WHERE id = $1`,
        [prId]
      );
      return json({ ok: true, status: "revealed" });
    }

    if (action === "update") {
      if (!data || typeof data !== "object") {
        return json({ error: "Thiếu data để update." }, 400);
      }

      // Whitelist các field được phép update
      const allowed = [
        "name", "description", "cover_url",
        "spotify_url", "youtube_url",
        "starts_at", "deadline",
        "allow_resubmit", "max_participants",
        "score_min", "score_max",
        "discord_channel_id", "discord_message_id",
      ];

      const fields = Object.keys(data).filter((k) => allowed.includes(k));
      if (fields.length === 0) {
        return json({ error: "Không có field hợp lệ để update." }, 400);
      }

      const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
      const values = fields.map((f) => data[f]);

      // Fix: Bẫy lỗi CHECK constraint từ DB (23514) thành thông báo thân thiện
      try {
        await client.query(
          `UPDATE party_ranks SET ${setClauses} WHERE id = $1`,
          [prId, ...values]
        );
        return json({ ok: true, updated: fields });
      } catch (err: any) {
        // 23514 = check_violation: score_min < score_max, starts_at < deadline, v.v.
        if (err.code === "23514") {
          return json(
            { error: "Giá trị không hợp lệ: kiểm tra lại score_min/max hoặc starts_at/deadline." },
            400
          );
        }
        throw err;
      }
    }

    return json({ error: `Action "${action}" không hợp lệ.` }, 400);
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// POST /[pr]/master/participants  → thêm participant
// DELETE /[pr]/master/participants → xoá participant
//
// Cloudflare Pages không hỗ trợ sub-route trong 1 file,
// nên dùng ?action= query param cho các thao tác participant
//
// POST body: { action: "add", discord_id, discord_username, discord_avatar? }
// POST body: { action: "remove", participant_id }
// ----------------------------------------------------------------
async function handlePost(context: EventContext) {
  const { env, params, request } = context;
  const { slug: pr } = params;

  let body: {
    action: string;
    discord_id?: string;
    discord_username?: string;
    discord_avatar?: string;
    participant_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body không hợp lệ." }, 400);
  }

  const client = getClient(env);
  await client.connect();

  try {
    const prRes = await client.query(
      `SELECT id, status, max_participants FROM party_ranks WHERE slug = $1`,
      [pr]
    );

    if (prRes.rowCount === 0) {
      return json({ error: "Party Rank không tồn tại." }, 404);
    }

    const { id: prId, status, max_participants } = prRes.rows[0];

    // --- Thêm participant ---
    if (body.action === "add") {
      const { discord_id, discord_username, discord_avatar } = body;

      if (!discord_id) {
        return json({ error: "Thiếu discord_id." }, 400);
      }
      if (status === "closed" || status === "revealed") {
        return json({ error: "Phiên đã đóng, không thể thêm participant." }, 400);
      }

      // Kiểm tra giới hạn
      if (max_participants) {
        const countRes = await client.query(
          `SELECT COUNT(*) FROM participants WHERE pr_id = $1`,
          [prId]
        );
        if (parseInt(countRes.rows[0].count) >= max_participants) {
          return json({ error: `Đã đạt giới hạn ${max_participants} người.` }, 400);
        }
      }

      const insertRes = await client.query(
        `INSERT INTO participants (pr_id, discord_id, discord_username, discord_avatar)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (pr_id, discord_id) DO NOTHING
         RETURNING id, token`,
        [prId, discord_id, discord_username ?? null, discord_avatar ?? null]
      );

      if (insertRes.rowCount === 0) {
        return json({ error: "Participant đã tồn tại trong PR này." }, 409);
      }

      const { id, token } = insertRes.rows[0];
      return json({ ok: true, id, token });
    }

    // --- Xoá participant ---
    if (body.action === "remove") {
      const { participant_id } = body;

      if (!participant_id) {
        return json({ error: "Thiếu participant_id." }, 400);
      }

      const deleteRes = await client.query(
        `DELETE FROM participants
         WHERE id = $1 AND pr_id = $2
         RETURNING id`,
        [participant_id, prId]
      );

      if (deleteRes.rowCount === 0) {
        return json({ error: "Participant không tồn tại." }, 404);
      }

      return json({ ok: true, deleted: participant_id });
    }

    // --- Thêm nhiều bài từ anisongdb (bulk) ---
    // Body: { action: "add_song", ann_song_ids: [1001, 1002, ...] }
    if (body.action === "add_song") {
      const { ann_song_ids } = body as any;
      const ids: number[] = Array.isArray(ann_song_ids) ? ann_song_ids : [ann_song_ids];

      if (!ids.length) {
        return json({ error: "Thiếu ann_song_ids." }, 400);
      }
      if (status === "closed" || status === "revealed") {
        return json({ error: "Phiên đã đóng, không thể thêm bài." }, 400);
      }

      // 1. Query tất cả trong 1 lần — UNNEST thay vì IN($1,$2,...)
      const anisongClient = getAnisongClient(env);
      await anisongClient.connect();
      let rows: any[];
      try {
        const anisongRes = await anisongClient.query(
          `SELECT
             sl.ann_song_id,
             sl.ann_id,
             sl.song_id,
             sl.type                                        AS song_type,
             s.name                                         AS song_title,
             COALESCE(a.name, g.name)                       AS artist,
             su.audio                                       AS audio_url,
             COALESCE(su.hq, su.mq)                         AS video_url,
             MAX(an.name) FILTER (WHERE UPPER(an.language) = 'EN') AS anime_en,
             MAX(an.name) FILTER (WHERE UPPER(an.language) = 'JA') AS anime_ja
           FROM song_link sl
           JOIN song s          ON s.song_id   = sl.song_id
           LEFT JOIN artist a   ON a.artist_id = s.song_artist_id
           LEFT JOIN "groups" g ON g.group_id  = s.song_group_id
           LEFT JOIN anime_name an ON an.ann_id = sl.ann_id
                                  AND an.is_main = TRUE
                                  AND UPPER(an.language) IN ('EN', 'JA')
           LEFT JOIN song_urls su ON su.ann_song_id = sl.ann_song_id
           WHERE sl.ann_song_id = ANY($1::int[])
             AND sl.is_deleted = FALSE
             AND s.is_deleted = FALSE
           GROUP BY sl.ann_song_id, sl.ann_id, sl.song_id, sl.type,
                    s.name, a.name, g.name, su.audio, su.hq, su.mq`,
          [ids]
        );
        rows = anisongRes.rows;
      } finally {
        await anisongClient.end();
      }

      // Báo rõ những id không tìm thấy thay vì âm thầm bỏ qua
      const foundIds = new Set(rows.map((r) => r.ann_song_id));
      const notFound = ids.filter((id) => !foundIds.has(id));
      if (notFound.length) {
        return json({ error: `Không tìm thấy ann_song_id: ${notFound.join(", ")}` }, 404);
      }

      // 2. Lấy position hiện tại cao nhất để gắn tiếp
      const posRes = await client.query(
        `SELECT COALESCE(MAX(position), 0) AS max_pos FROM songs WHERE pr_id = $1`,
        [prId]
      );
      let nextPos: number = posRes.rows[0].max_pos;

      // 3. Bulk insert bằng UNNEST — 1 RTT cho toàn bộ danh sách
      const arrPrId       = rows.map(() => prId);
      const arrPos        = rows.map(() => ++nextPos);
      const arrAnnSongId  = rows.map((r) => r.ann_song_id);
      const arrAnnId      = rows.map((r) => r.ann_id);
      const arrSongId     = rows.map((r) => r.song_id);
      const arrAnime      = rows.map((r) => r.anime_en ?? r.anime_ja ?? "Unknown");
      const arrSongTitle  = rows.map((r) => r.song_title);
      const arrArtist     = rows.map((r) => r.artist ?? null);
      const arrSongType   = rows.map((r) => Number(r.song_type));
      const arrAudioUrl   = rows.map((r) => r.audio_url ?? null);
      const arrVideoUrl   = rows.map((r) => r.video_url ?? null);

      try {
        const insertRes = await client.query(
          `INSERT INTO songs
             (pr_id, position, ann_song_id, ann_id, song_id,
              anime, song_title, artist, song_type, audio_url, video_url)
           SELECT
             unnest($1::uuid[]),  unnest($2::int[]),  unnest($3::int[]),
             unnest($4::int[]),   unnest($5::int[]),  unnest($6::text[]),
             unnest($7::text[]),  unnest($8::text[]), unnest($9::smallint[]),
             unnest($10::text[]), unnest($11::text[])
           RETURNING pr_id, position, ann_song_id, anime, song_title`,
          [arrPrId, arrPos, arrAnnSongId, arrAnnId, arrSongId,
           arrAnime, arrSongTitle, arrArtist, arrSongType, arrAudioUrl, arrVideoUrl]
        );

        return json({
          ok:      true,
          added:   insertRes.rowCount,
          songs:   insertRes.rows,
        });
      } catch (err) {
        console.error("Error inserting songs:", err);
        return json({ error: "Lỗi lưu dữ liệu: " + (err instanceof Error ? err.message : String(err)) }, 500);
      }
    }

    // --- Xoá nhiều bài khỏi PR (bulk) ---
    // Body: { action: "remove_song", ann_song_ids: [1001, 1002, ...] }
    if (body.action === "remove_song") {
      const { ann_song_ids } = body as any;
      const ids: number[] = Array.isArray(ann_song_ids) ? ann_song_ids : [ann_song_ids];

      if (!ids.length) {
        return json({ error: "Thiếu ann_song_ids." }, 400);
      }
      if (status === "closed" || status === "revealed") {
        return json({ error: "Phiên đã đóng, không thể xoá bài." }, 400);
      }

      const deleteRes = await client.query(
        `DELETE FROM songs
         WHERE ann_song_id = ANY($1::int[]) AND pr_id = $2
         RETURNING ann_song_id`,
        [ids, prId]
      );

      const deletedIds = deleteRes.rows.map((r) => r.ann_song_id);
      const notFound   = ids.filter((id) => !deletedIds.includes(id));

      return json({
        ok:        true,
        deleted:   deletedIds,
        not_found: notFound,
      });
    }

    return json({ error: `Action "${body.action}" không hợp lệ.` }, 400);
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------
// HTML của master dashboard — được inject PR_SLUG từ params

export const onRequest = async (context: EventContext) => {
  const { request, env, params } = context;
  const method = request.method.toUpperCase();
  const { slug: pr } = params;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // Tất cả route API đều yêu cầu auth
  const isAuth = await authMaster(request, env);
  if (!isAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    let res: Response;
    if (method === "GET")        res = await handleGet(context);
    else if (method === "PATCH") res = await handlePatch(context);
    else if (method === "POST")  res = await handlePost(context);
    else return new Response("Method not allowed", { status: 405 });

    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error("[master].ts error:", err);
    return json({ error: "Lỗi server." }, 500);
  }
};
