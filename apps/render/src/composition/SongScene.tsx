import { Composition, useVideoConfig, useCurrentFrame } from "remotion";
import { RenderInputProps } from "../types";
import { VideoPlayer } from "../components/VideoPlayer";
import { TitleBar } from "../components/TitleBar";
import { ParticipantGrid } from "../components/ParticipantGrid";
import { TotalScoreBox } from "../components/TotalScoreBox";
import { CaptionBar } from "../components/CaptionBar";

interface SongSceneProps {
  songData: RenderInputProps["songData"];
  videoCdnPrefix: string;
}

export const SongScene: React.FC<SongSceneProps> = ({ songData, videoCdnPrefix }) => {
  const { fps, durationInFrames } = useVideoConfig();
  const { song } = songData;

  // Calculate actual duration from clipDurationSeconds
  const actualDurationInFrames = Math.round(song.clipDurationSeconds * fps);

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

interface RootProps {
  songData: RenderInputProps["songData"];
  videoCdnPrefix: string;
}

export const Root: React.FC<RootProps> = ({ songData, videoCdnPrefix }) => {
  const { song } = songData;
  const durationInFrames = Math.round(song.clipDurationSeconds * 23.976);

  return (
    <Composition
      id="SongScene"
      component={SongScene as any}
      durationInFrames={durationInFrames}
      fps={23.976}
      width={1920}
      height={1080}
      defaultProps={{ songData, videoCdnPrefix }}
    />
  );
};