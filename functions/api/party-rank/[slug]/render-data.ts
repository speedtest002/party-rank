import { Client } from "pg";
import { isBotSecret } from "../../../lib/clerk";

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

    for (const song of songsRes.rows) {
      const songScores = scoresBySong.get(song.ann_song_id) || [];
      if (songScores.length === 0) continue; // skip songs with no votes

      // Find min/max score for this song
      const scoresOnly = songScores.map((s) => s.score);
      const minScore = Math.min(...scoresOnly);
      const maxScore = Math.max(...scoresOnly);

      // Build participants array with isHighest/isLowest
      const participants = songScores.map((sc) => {
        const p = participantMap.get(sc.participant_id);
        if (!p) return null;
        return {
          discordId: p.discord_id,
          displayName: p.discord_username || `User_${p.discord_id.slice(-4)}`,
          avatarUrl: p.discord_avatar || "", // will be replaced with cached URL by worker
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
          avgScore: Number(song.avg_score),
          voteCount: Number(song.vote_count),
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

  // Internal endpoint — only the render worker (authenticated by BOT_SECRET) may use it
  if (!isBotSecret(request, env)) {
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
    console.error("[render-data] error:", err);
    return json({ error: "Internal Server Error." }, 500);
  }
};