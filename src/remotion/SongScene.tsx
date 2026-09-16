import { useVideoConfig } from "remotion";
import { RenderInputProps } from "./types";
import { VideoPlayer } from "./components/VideoPlayer";
import { TitleBar } from "./components/TitleBar";
import { ParticipantGrid } from "./components/ParticipantGrid";
import { TotalScoreBox } from "./components/TotalScoreBox";
import { CaptionBar } from "./components/CaptionBar";

interface SongSceneProps {
  songData: RenderInputProps["songData"];
  videoCdnPrefix: string;
}

export const SongScene: React.FC<SongSceneProps> = ({ songData, videoCdnPrefix }) => {
  const { fps } = useVideoConfig();
  const { song } = songData;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0A0A0A",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background video player */}
      <VideoPlayer props={{ songData, videoCdnPrefix }} />

      {/* Overlay components */}
      <TitleBar props={{ songData, videoCdnPrefix }} />
      <ParticipantGrid props={{ songData, videoCdnPrefix }} />
      <TotalScoreBox props={{ songData, videoCdnPrefix }} />
      <CaptionBar props={{ songData, videoCdnPrefix }} />
    </div>
  );
};