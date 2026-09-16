import { Client } from "pg";
import { resolveAuthUser, resolveCurrentAvatars } from "../../../lib/clerk";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
interface Env {
  DB: { connectionString: string };
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  BOT_SECRET?: string;
  VIDEO_CDN_PREFIX?: string;
}

interface EventContext {
  env: Env;
  params: { slug: string };
  request: Request;
}

interface RenderDataSong {
  partyRankId: string;
  partyRankName: string;
  song: {
    annSongId: number;
    rank: number;
    totalSongs: number;
    animeName: string;
    songTitle: string;
    artist: string;
    songType: "OP" | "ED" | "IN";
    videoUrl: string;
    coverUrl: string;
    clipStartSeconds: number;
    clipDurationSeconds: number;
    avgScore: number;
    voteCount: number;
  };
  participants: {
    discordId: string;
    displayName: string;
    avatarUrl: string;
    score: number;
    personalRank: number;
    isHighest: boolean;
    isLowest: boolean;
  }[];
}

interface SongResultRow {
  ann_song_id: number;
  ann_id: number | null;
  anime: string;
  song_title: string;
  artist: string | null;
  song_type: 1 | 2 | 3;
  position: number;
  vote_count: number;
  avg_score: number;
  avg_rank: number;
  min_score: number;
  max_score: number;
  final_rank: number;
  video_url: string | null;
  cover_url: string | null;
  clip_start_seconds: number;
  clip_duration_seconds: number;
}

interface ParticipantRow {
  id: string;
  discord_id: string;
  discord_username: string | null;
  discord_avatar: string | null;
}

interface ScoreRow {
  ann_song_id: number;
  participant_id: string;
  rank: number;
  score: number;
}

interface BreakdownRow {
  ann_song_id: number;
  rank: number;
  score: number;
  discord_id: string;
  discord_username: string | null;
  discord_avatar: string | null;
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

const songTypeToString = (type: 1 | 2 | 3): "OP" | "ED" | "IN" => {
  switch (type) {
    case 1:
      return "OP";
    case 2:
      return "ED";
    default:
      return "IN";
  }
};

// ----------------------------------------------------------------
// GET /[slug]/render-data
// Internal endpoint for render worker — requires auth (handled by middleware)
// Returns array of songs sorted by rank ASC (for countdown)
// ----------------------------------------------------------------
async function handleGet(context: EventContext) {
  const { env, params } = context;
  const { slug: pr } = params;
  const client = getClient(env);
  await client.connect();

  try {
    // 1. Get party rank info
    const prRes = await client.query(
      `SELECT id, name FROM party_ranks WHERE slug = $1`,
      [pr]
    );
    if (prRes.rowCount === 0) return json({ error: "Party Rank not found." }, 404);
    const { id: prId, name: partyRankName } = prRes.rows[0];

    // 2. Get songs with results (only revealed party ranks should have render data)
    const songsRes = await client.query<SongResultRow>(
      `SELECT s.ann_song_id, s.ann_id, s.anime, s.song_title, s.artist, s.song_type, s.position,
              sr.vote_count::int, sr.avg_score, sr.avg_rank, sr.min_score, sr.max_score, sr.final_rank::int,
              s.video_url, s.cover_url, s.clip_start_seconds, s.clip_duration_seconds
       FROM songs s
       JOIN song_results sr ON sr.pr_id = s.pr_id AND sr.ann_song_id = s.ann_song_id
       WHERE s.pr_id = $1
       ORDER BY sr.final_rank ASC, s.position ASC`,
      [prId]
    );

    if (songsRes.rowCount === 0) return json([], 200);

    // 3. Get all participants for this PR
    const participantsRes = await client.query<ParticipantRow>(
      `SELECT id, discord_id, discord_username, discord_avatar FROM participants WHERE pr_id = $1`,
      [prId]
    );
    const participantMap = new Map(participantsRes.rows.map((p) => [p.id, p]));

    // 4. Get all scores for this PR
    const scoresRes = await client.query<ScoreRow>(
      `SELECT ann_song_id, participant_id, rank, score::float FROM scores WHERE pr_id = $1`,
      [prId]
    );

    // 4b. Group scores by ann_song_id
    const scoresBySong = new Map<number, ScoreRow[]>();
    for (const s of scoresRes.rows) {
      if (!scoresBySong.has(s.ann_song_id)) scoresBySong.set(s.ann_song_id, []);
      scoresBySong.get(s.ann_song_id)!.push(s);
    }

    // 5. Get breakdown (participant details per song)
    const breakdownRes = await client.query<BreakdownRow>(
      `SELECT sc.ann_song_id, sc.rank, sc.score::float, p.discord_id, p.discord_username, p.discord_avatar
       FROM scores sc
       JOIN participants p ON p.id = sc.participant_id
       WHERE sc.pr_id = $1
       ORDER BY sc.ann_song_id, sc.rank ASC`,
      [prId]
    );

    // 6. Build response for each song
    const totalSongs = songsRes.rows.length;
    const renderData: RenderDataSong[] = [];

    // Collect unique participant discord IDs for avatar refresh
    const discordIds: string[] = [];
    for (const p of participantsRes.rows) {
      if (p.discord_id && !discordIds.includes(p.discord_id)) {
        discordIds.push(p.discord_id);
      }
    }

    // Resolve current avatars from Clerk (best-effort) and persist back to DB
    let freshAvatars = new Map<string, string>();
    if (discordIds.length > 0 && env.CLERK_SECRET_KEY) {
      freshAvatars = await resolveCurrentAvatars(
        env.CLERK_SECRET_KEY,
        env.CLERK_PUBLISHABLE_KEY,
        discordIds
      );
      if (freshAvatars.size > 0) {
        for (const [discordId, avatarUrl] of freshAvatars) {
          // Update users table (global)
          await client.query(
            `UPDATE users SET discord_avatar = $1 WHERE discord_id = $2 AND (discord_avatar IS NULL OR discord_avatar <> $1)`,
            [avatarUrl, discordId]
          );
          // Update participants table (per-PR) — this is where render-data reads from
          await client.query(
            `UPDATE participants SET discord_avatar = $1 WHERE discord_id = $2 AND pr_id = $3 AND (discord_avatar IS NULL OR discord_avatar <> $1)`,
            [avatarUrl, discordId, prId]
          );
        }
      }
    }

    for (const song of songsRes.rows) {
      const songScores = scoresBySong.get(song.ann_song_id) || [];

      // Find min/max score (0 for songs with no votes)
      const scoresOnly = songScores.map((s) => s.score);
      const minScore = scoresOnly.length > 0 ? Math.min(...scoresOnly) : 0;
      const maxScore = scoresOnly.length > 0 ? Math.max(...scoresOnly) : 0;

      // Build participants array with isHighest/isLowest
      const participants = songScores.map((sc) => {
        const p = participantMap.get(sc.participant_id);
        if (!p) return null;
        return {
          discordId: p.discord_id,
          displayName: p.discord_username || `User_${p.discord_id.slice(-4)}`,
          avatarUrl: freshAvatars.get(p.discord_id) || p.discord_avatar || "",
          score: sc.score,
          personalRank: sc.rank,
          isHighest: sc.score === maxScore,
          isLowest: sc.score === minScore,
        };
      }).filter(Boolean) as RenderDataSong["participants"];

      // Sort participants by personalRank
      participants.sort((a, b) => a.personalRank - b.personalRank);

      renderData.push({
        partyRankId: prId,
        partyRankName,
        song: {
          annSongId: song.ann_song_id,
          rank: Number(song.final_rank),
          totalSongs,
          animeName: song.anime,
          songTitle: song.song_title,
          artist: song.artist || "Unknown",
          songType: songTypeToString(song.song_type),
          videoUrl: song.video_url || "",
          coverUrl: song.cover_url || "",
          clipStartSeconds: Number(song.clip_start_seconds),
          clipDurationSeconds: Number(song.clip_duration_seconds),
          avgScore: Number(song.avg_score ?? 0),
          voteCount: Number(song.vote_count ?? 0),
        },
        participants,
      });
    }

    return json(renderData, 200);
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

  // Accept Clerk JWT (admin/user) or BOT_SECRET (render worker)
  const authUser = await resolveAuthUser(request, env);
  if (!authUser) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Master-only: owner, admin, or BOT
  if (authUser !== "BOT") {
    const { slug } = params;
    const client = new Client({ connectionString: env.DB.connectionString });
    await client.connect();
    try {
      const checkRes = await client.query(
        `SELECT pr.created_by_discord_id, u.role FROM party_ranks pr LEFT JOIN users u ON u.discord_id = $2 WHERE pr.slug = $1`,
        [slug, authUser]
      );
      if (checkRes.rowCount === 0) {
        return json({ error: "Party Rank not found." }, 404);
      }
      const { created_by_discord_id, role } = checkRes.rows[0];
      const isOwner = created_by_discord_id === authUser;
      const isAdmin = role === "admin";
      if (!isOwner && !isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden." }), {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    } finally {
      await client.end();
    }
  }

  try {
    const res = await handleGet(context);
    // Wrap array response with videoCdnPrefix for browser render
    const body = await res.json() as any;
    const wrapped = Array.isArray(body)
      ? { videoCdnPrefix: env.VIDEO_CDN_PREFIX || "", songs: body }
      : body;
    const wrappedRes = new Response(JSON.stringify(wrapped), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
    for (const [k, v] of Object.entries(cors)) wrappedRes.headers.set(k, v);
    return wrappedRes;
  } catch (err) {
    console.error("[render-data] error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};