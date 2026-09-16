import { Composition } from "remotion";
import { SongScene } from "./composition/SongScene";
import { SongData } from "./types";

export const FPS = 23.976;
export const DEFAULT_CLIP_DURATION_SECONDS = 8;

const defaultSongData: SongData = {
  partyRankId: "00000000-0000-0000-0000-000000000000",
  partyRankName: "Party Rank",
  song: {
    annSongId: 0,
    rank: 1,
    totalSongs: 10,
    animeName: "Anime",
    songTitle: "Song Title",
    artist: "Artist",
    songType: "OP",
    videoUrl: "",
    coverUrl: "",
    clipStartSeconds: 0,
    clipDurationSeconds: DEFAULT_CLIP_DURATION_SECONDS,
    avgScore: 8.5,
    voteCount: 8,
  },
  participants: [
    {
      discordId: "user-1",
      displayName: "Alice",
      avatarUrl: "",
      score: 9.5,
      personalRank: 1,
      isHighest: true,
      isLowest: false,
    },
    {
      discordId: "user-2",
      displayName: "Bob",
      avatarUrl: "",
      score: 8.0,
      personalRank: 2,
      isHighest: false,
      isLowest: false,
    },
    {
      discordId: "user-3",
      displayName: "Carol",
      avatarUrl: "",
      score: 6.0,
      personalRank: 3,
      isHighest: false,
      isLowest: true,
    },
  ],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="SongScene"
      component={SongScene as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={Math.round(DEFAULT_CLIP_DURATION_SECONDS * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ songData: defaultSongData, videoCdnPrefix: "" }}
      calculateMetadata={({ props }) => {
        const songData = (props as { songData?: SongData }).songData;
        const durationSec = songData?.song?.clipDurationSeconds || DEFAULT_CLIP_DURATION_SECONDS;
        const frames = Math.max(1, Math.round(durationSec * FPS));
        return { durationInFrames: frames };
      }}
    />
  );
};