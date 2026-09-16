import { useCurrentFrame } from "remotion";
import { useVideoConfig } from "remotion";
import { RenderInputProps } from "../types";
import { fadeIn } from "../utils/interpolation";

interface CaptionBarProps {
  props: RenderInputProps;
}

export function CaptionBar({ props }: CaptionBarProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { songData } = props;
  const { song } = songData;

  // Caption fades in at 2.2s and stays until end
  const startFrame = Math.round(2.2 * fps);
  const endFrame = startFrame + Math.round(0.5 * fps);

  const opacity = fadeIn(frame, fps, startFrame, endFrame);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "8%",
        minHeight: 86,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 60px",
        background: "linear-gradient(0deg, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0) 100%)",
        zIndex: 10,
        opacity,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 500,
          color: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        {song.songTitle} by {song.artist}
      </div>
    </div>
  );
}