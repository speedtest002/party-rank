export interface PartyRank {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  spotify_url: string | null;
  youtube_url: string | null;
  status: 'draft' | 'open' | 'closed' | 'revealed';
  starts_at: string | null;
  deadline: string | null;
  closed_at: string | null;
  allow_resubmit: boolean;
  max_participants: number | null;
  score_min: number;
  score_max: number;
  discord_guild_id: string | null;
  discord_thread_id: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  created_by_discord_id: string | null;
}

export interface Song {
  ann_song_id: number;
  pr_id: string;
  ann_id: number | null;
  song_id: number | null;
  anime: string;
  song_title: string;
  artist: string | null;
  song_type: 1 | 2 | 3; // 1 = OP, 2 = ED, 3 = IN
  audio_url: string | null;
  video_url: string | null;
  cover_url: string | null;
  position: number;
  created_at?: string;
}

export interface Participant {
  id: string;
  pr_id: string;
  discord_id: string;
  discord_username: string | null;
  discord_avatar: string | null;
  status: 'invited' | 'viewed' | 'submitted';
  token: string;
  invited_at: string;
  first_viewed_at: string | null;
  submitted_at: string | null;
  submit_count: number;
}

export interface Score {
  id: string;
  participant_id: string;
  ann_song_id: number;
  pr_id: string;
  rank: number;
  score: number;
  created_at: string;
  updated_at: string;
}

export interface SongResult extends Song {
  vote_count: number;
  avg_score: number;
  avg_rank: number;
  min_score: number;
  max_score: number;
  final_rank: number;
}
