import { interpolate, useCurrentFrame } from "remotion";
import { useVideoConfig } from "remotion";
import { RenderInputProps } from "../types";
import { fadeIn, slideInY } from "../utils/interpolation";

interface TitleBarProps {
  props: RenderInputProps;
}

export function TitleBar({ props }: TitleBarProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { songData } = props;
  const { song } = songData;

  // Animation: 0.0s–0.6s fade/slide in from top
  const startFrame = 0;
  const endFrame = Math.round(0.6 * fps);

  const opacity = fadeIn(frame, fps, startFrame, endFrame);
  const y = slideInY(frame, fps, startFrame, endFrame, -100, 0);

  const songTypeColor =
    song.songType === "OP"
      ? "#FF6B6B"
      : song.songType === "ED"
      ? "#4ECDC4"
      : "#FFE66D";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "10%",
        minHeight: 108,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 60px",
        background: "linear-gradient(180deg, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0) 100%)",
        zIndex: 10,
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Left: Rank badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div
          style={{
            width: 70,
            height: 70,
            borderRadius: "16px",
            background: "#5865F2",
            color: "#FFFFFF",
            fontSize: 32,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          #{song.rank}
        </div>
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#FFFFFF",
              fontFamily: "Inter, system-ui, sans-serif",
              textTransform: "uppercase",
            }}
          >
            {song.animeName}
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 400,
              color: "#AAAAAA",
              fontFamily: "Inter, system-ui, sans-serif",
              marginTop: 4,
            }}
          >
            {song.songType} — {song.songTitle}
          </div>
        </div>
      </div>

      {/* Right: ALL badge (total songs) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            padding: "8px 20px",
            borderRadius: "20px",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            fontSize: 18,
            fontWeight: 500,
            color: "#FFFFFF",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          ALL {song.totalSongs}
        </div>
      </div>
    </div>
  );
}