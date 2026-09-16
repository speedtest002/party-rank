import { useCurrentFrame } from "remotion";
import { useVideoConfig } from "remotion";
import { RenderInputProps } from "../types";
import { countUp, fadeIn } from "../utils/interpolation";

interface TotalScoreBoxProps {
  props: RenderInputProps;
}

export function TotalScoreBox({ props }: TotalScoreBoxProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { songData } = props;
  const { song } = songData;

  // Total score box appears at 1.5s–2.2s (after individual scores)
  const startFrame = Math.round(1.5 * fps);
  const endFrame = Math.round(2.2 * fps);

  const opacity = fadeIn(frame, fps, startFrame, endFrame);
  const displayedAvg = countUp(frame, fps, startFrame, endFrame, song.avgScore, 1);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        right: "4%",
        opacity,
        transform: `translateY(${(1 - opacity) * 50}px)`,
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: "rgba(10,10,10,0.9)",
          border: "2px solid #5865F2",
          borderRadius: "16px",
          padding: "20px 32px",
          textAlign: "right",
          minWidth: 180,
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#AAAAAA",
            fontFamily: "Inter, system-ui, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 8,
          }}
        >
          ĐIỂM TRUNG BÌNH
        </div>
        <div
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#FFFFFF",
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1,
          }}
        >
          {displayedAvg}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 400,
            color: "#888888",
            fontFamily: "Inter, system-ui, sans-serif",
            marginTop: 8,
          }}
        >
          từ {song.voteCount} người chấm
        </div>
      </div>
    </div>
  );
}