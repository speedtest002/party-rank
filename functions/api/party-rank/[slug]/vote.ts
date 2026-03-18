import { Client } from "pg";
import { getAuth } from "../../../lib/auth";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
  BETTER_AUTH_SECRET: string;
  APP_URL: string;
}

interface ScoreInput {
  ann_song_id: number;
  rank: number;
  score: number;
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

// ---------------------------------------------------------------
// Auth: Verify Clerk JWT → resolve Discord ID via Clerk API
// Returns discord_id string or null if invalid/not linked
// ----------------------------------------------------------------
async function resolveDiscordId(
  request: Request,
  env: Env
): Promise<string | null> {
  try {
    const auth = getAuth(env);
    const sessionRes = await auth.api.getSession({
        headers: request.headers
    });
    
    if (!sessionRes || !sessionRes.user) return null;
    
    const user = sessionRes.user;
    return (user as any).discord_id || null;
  } catch (err) {
    console.error("Auth error:", err);
    return null;
  }
}

// ----------------------------------------------------------------
// GET /api/party-rank/[pr]/vote
// Load songs + participant info for the authenticated Discord user
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params, request } = context;
  const { slug: pr } = params;

  const discordId = await resolveDiscordId(request, env);
  if (!discordId) {
    return json({ error: "Unauthorized. Please login with Discord." }, 401);
  }

  const client = getClient(env);
  await client.connect();

  try {
    // Get Party Rank info first to handle errors gracefully
    let partyRank: any;
    try {
      const prRes = await client.query(
        `SELECT id, name, slug, status, spotify_url, youtube_url, deadline, 
                allow_resubmit, discord_guild_id, discord_thread_id,
                score_min::float AS score_min, score_max::float AS score_max
         FROM party_ranks
         WHERE slug = $1`,
        [pr]
      );
      if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
      partyRank = prRes.rows[0];
    } catch (err: any) {
      if (err.code === '42703') { // undefined_column
        const prRes = await client.query(
          `SELECT id, name, slug, status, spotify_url, youtube_url, deadline, 
                  allow_resubmit,
                  score_min::float AS score_min, score_max::float AS score_max
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

    // Look up participant by discord_id + pr slug
    const participantRes = await client.query(
      `SELECT * FROM participants WHERE discord_id = $1 AND pr_id = $2`,
      [discordId, partyRank.id]
    );

    if (participantRes.rowCount === 0) {
      return json(
        {
          error: "You have not been invited to this session.",
          code: "NOT_INVITED",
          discord_guild_id: partyRank.discord_guild_id,
          discord_thread_id: partyRank.discord_thread_id,
        },
        403
      );
    }

    const p = participantRes.rows[0];

    if (partyRank.status === "draft") {
      return json({ error: "Voting session is not yet open." }, 403);
    }

    // Mark as viewed on first visit
    if (!p.first_viewed_at) {
      await client.query(
        `UPDATE participants
         SET first_viewed_at = NOW(), status = 'viewed'
         WHERE id = $1 AND first_viewed_at IS NULL`,
        [p.id]
      );
    }

    const songsRes = await client.query(
      `SELECT ann_song_id, ann_id, song_id, anime, song_title, artist,
              song_type, audio_url, video_url, cover_url, position
       FROM songs
       WHERE pr_id = $1
       ORDER BY position ASC`,
      [partyRank.id]
    );

    const scoresRes = await client.query(
      `SELECT ann_song_id, rank, score::float AS score
       FROM scores
       WHERE participant_id = $1`,
      [p.id]
    );

    const previousScores = Object.fromEntries(
      scoresRes.rows.map((r) => [r.ann_song_id, { rank: r.rank, score: r.score }])
    );

    return json({
      pr: {
        name:          partyRank.name,
        slug:          partyRank.slug,
        status:        partyRank.status,
        deadline:      partyRank.deadline,
        spotify_url:   partyRank.spotify_url,
        youtube_url:   partyRank.youtube_url,
        score_min:     partyRank.score_min,
        score_max:     partyRank.score_max,
        allow_resubmit: partyRank.allow_resubmit,
        discord_guild_id: partyRank.discord_guild_id,
        discord_thread_id: partyRank.discord_thread_id,
      },
      participant: {
        id:               p.id,
        discord_id:       p.discord_id,
        discord_username: p.discord_username,
        status:           p.status,
        submitted_at:     p.submitted_at,
        submit_count:     p.submit_count,
      },
      songs:          songsRes.rows,
      previousScores,
    });
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// POST /api/party-rank/[pr]/vote
// Submit scores for the authenticated Discord user
// Body: { scores: [{ ann_song_id, rank, score }] }
// ----------------------------------------------------------------
async function handlePost(context: EventContext) {
  const { env, params, request } = context;
  const { slug: pr } = params;

  const discordId = await resolveDiscordId(request, env);
  if (!discordId) {
    return json({ error: "Unauthorized. Please login with Discord." }, 401);
  }

  let body: { scores?: ScoreInput[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid body." }, 400);
  }

  const { scores } = body;
  if (!Array.isArray(scores) || scores.length === 0) {
    return json({ error: "Missing scores data." }, 400);
  }

  const client = getClient(env);
  await client.connect();

  try {
    const participantRes = await client.query(
      `SELECT p.*,
              pr.status       AS pr_status,
              pr.score_min::float AS score_min,
              pr.score_max::float AS score_max,
              pr.allow_resubmit,
              (SELECT array_agg(ann_song_id) FROM songs WHERE pr_id = pr.id) AS valid_song_ids
       FROM participants p
       JOIN party_ranks pr ON pr.id = p.pr_id
       WHERE p.discord_id = $1 AND pr.slug = $2`,
      [discordId, pr]
    );

    if (participantRes.rowCount === 0) {
      return json({ error: "You have not been invited to this session." }, 403);
    }

    const participant = participantRes.rows[0];
    const scoreMin: number = participant.score_min;
    const scoreMax: number = participant.score_max;
    const validSongIds: number[] = participant.valid_song_ids ?? [];
    const actualSongCount = validSongIds.length;

    if (participant.pr_status !== "open") {
      return json({ error: "Voting session is closed." }, 403);
    }
    if (participant.status === "submitted" && !participant.allow_resubmit) {
      return json({ error: "You have already submitted your scores." }, 403);
    }
    if (scores.length !== actualSongCount) {
      return json(
        { error: `Please score all ${actualSongCount} entries.` },
        400
      );
    }

    const seenRanks   = new Set<number>();
    const seenSongIds = new Set<number>();

    for (const s of scores) {
      const valScore  = parseFloat(String(s.score));
      const valSongId = Number(s.ann_song_id);

      if (!validSongIds.includes(valSongId)) {
        return json({ error: "Invalid entry detected." }, 400);
      }
      if (seenSongIds.has(valSongId)) {
        return json({ error: "Duplicate scores submitted for the same song." }, 400);
      }
      seenSongIds.add(valSongId);

      if (isNaN(valScore) || valScore < scoreMin || valScore > scoreMax) {
        return json({ error: `Score must be between ${scoreMin} and ${scoreMax}.` }, 400);
      }
      if (!Number.isInteger(s.rank) || s.rank < 1 || s.rank > actualSongCount) {
        return json({ error: `Rank must be between 1 and ${actualSongCount}.` }, 400);
      }
      if (seenRanks.has(s.rank)) {
        return json({ error: "Duplicate ranks detected." }, 400);
      }
      seenRanks.add(s.rank);
    }

    // Bulk upsert with UNNEST — single round-trip
    const arrSongIds = scores.map((s) => s.ann_song_id);
    const arrRanks   = scores.map((s) => s.rank);
    const arrScores  = scores.map((s) => parseFloat(String(s.score)));

    try {
      await client.query("BEGIN");

      // Clear existing scores for this participant in this PR
      await client.query(
        `DELETE FROM scores WHERE participant_id = $1 AND pr_id = $2`,
        [participant.id, participant.pr_id]
      );

      // Bulk insert new scores
      await client.query(
        `INSERT INTO scores (participant_id, ann_song_id, pr_id, rank, score)
         SELECT $1, unnest($2::int[]), $3, unnest($4::int[]), unnest($5::numeric[])`,
        [participant.id, arrSongIds, participant.pr_id, arrRanks, arrScores]
      );

      await client.query(
        `UPDATE participants
         SET status       = 'submitted',
             submitted_at = NOW(),
             submit_count = submit_count + 1
         WHERE id = $1`,
        [participant.id]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return json({ ok: true, message: "Scores submitted successfully!" });
  } finally {
    await client.end();
  }
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------
export const onRequest = async (context: EventContext) => {
  const method = context.request.method.toUpperCase();

  const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    let res: Response;
    if (method === "GET")        res = await handleGet(context);
    else if (method === "POST")  res = await handlePost(context);
    else return new Response("Method not allowed", { status: 405 });

    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } catch (err) {
    console.error("[vote].ts error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};
