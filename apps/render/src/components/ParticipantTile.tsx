import { interpolate, useCurrentFrame } from "remotion";
import { useVideoConfig } from "remotion";
import { ParticipantData } from "../types";
import { fadeIn, scaleBounce, countUp } from "../utils/interpolation";

interface ParticipantTileProps {
  participant: ParticipantData;
  layout: {
    tileSize: number;
    fontSizeName: number;
    fontSizeScore: number;
  };
  index: number;
  totalParticipants: number;
}

export function ParticipantTile({
  participant,
  layout,
  index,
  totalParticipants,
}: ParticipantTileProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const { displayName, score, isHighest, isLowest } = participant;

  // Stagger: 0.2s–1.2s, ~30ms per tile
  const tileStartMs = 200 + index * 30;
  const tileEndMs = 1200;
  const startFrame = Math.round((tileStartMs / 1000) * fps);
  const endFrame = Math.round((tileEndMs / 1000) * fps);

  const opacity = fadeIn(frame, fps, startFrame, endFrame);
  const scale = scaleBounce(frame, fps, startFrame, endFrame);

  // Score count-up: 0.3s–1.3s
  const scoreStartFrame = Math.round(0.3 * fps);
  const scoreEndFrame = Math.round(1.3 * fps);
  const displayedScore = countUp(frame, fps, scoreStartFrame, scoreEndFrame, score, 1);

  // Colors based on highlight
  const scoreBgColor = isHighest
    ? "#22C55E"
    : isLowest
    ? "#EF4444"
    : "#3A3A3A";
  const scoreBorderColor = isHighest
    ? "#22C55E"
    : isLowest
    ? "#EF4444"
    : "#5865F2";
  const scoreTextColor = "#FFFFFF";

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        width: layout.tileSize,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: layout.tileSize * 0.75,
          height: layout.tileSize * 0.75,
          borderRadius: "8px",
          overflow: "hidden",
          background: "#1A1A1A",
          border: `2px solid ${scoreBorderColor}`,
          boxShadow: isHighest || isLowest ? `0 0 12px ${scoreBorderColor}80` : "none",
        }}
      >
        {participant.avatarUrl ? (
          <img
            src={participant.avatarUrl}
            alt={displayName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: layout.tileSize * 0.3,
              fontWeight: 700,
              color: "#555",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <div
        style={{
          width: "100%",
          textAlign: "center",
          fontSize: layout.fontSizeName,
          fontWeight: 500,
          color: "#FFFFFF",
          fontFamily: "Inter, system-ui, sans-serif",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {displayName}
      </div>

      {/* Score box */}
      <div
        style={{
          width: layout.tileSize * 0.8,
          padding: "6px 0",
          borderRadius: "8px",
          background: scoreBgColor,
          border: `2px solid ${scoreBorderColor}`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: layout.fontSizeScore,
            fontWeight: 800,
            color: scoreTextColor,
            fontFamily: "Inter, system-ui, sans-serif",
            lineHeight: 1,
          }}
        >
          {displayedScore}
        </div>
      </div>

      {isHighest && (
        <div
          style={{
            position: "relative",
            top: -28,
            right: -layout.tileSize * 0.3,
            width: 20,
            height: 20,
            background: "#FFD700",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#000",
          }}
        >
          ★
        </div>
      )}
    </div>
  );
}