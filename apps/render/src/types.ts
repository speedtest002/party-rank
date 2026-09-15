export interface ParticipantData {
  discordId: string;
  displayName: string;
  avatarUrl: string;
  score: number;
  personalRank: number;
  isHighest: boolean;
  isLowest: boolean;
}

export interface SongData {
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
  participants: ParticipantData[];
}

export interface RenderInputProps {
  songData: SongData;
  videoCdnPrefix: string;
}