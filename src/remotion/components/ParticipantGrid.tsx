import { RenderInputProps } from "../types";
import { ParticipantTile } from "./ParticipantTile";
import { calculateGridLayout, getVisibleParticipants } from "../utils/layout";

interface ParticipantGridProps {
  props: RenderInputProps;
}

export function ParticipantGrid({ props }: ParticipantGridProps) {
  const { songData } = props;
  const { participants } = songData;

  const layout = calculateGridLayout(participants.length);
  const visibleParticipants = getVisibleParticipants(participants, layout.maxVisible);

  // Split participants into left and right columns
  const mid = Math.ceil(visibleParticipants.length / 2);
  const leftParticipants = visibleParticipants.slice(0, mid);
  const rightParticipants = visibleParticipants.slice(mid);

  const gridTemplateColumns = `repeat(${layout.colsPerSide}, 1fr)`;

  return (
    <>
      {/* Left column */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          bottom: "8%",
          left: 0,
          width: "22%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 10px",
          gap: 16,
          zIndex: 5,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns,
            gap: 16,
            justifyItems: "center",
            width: "100%",
          }}
        >
          {leftParticipants.map((p, i) => (
            <ParticipantTile
              key={p.isOther ? "other-left" : p.discordId}
              participant={p as any}
              layout={layout}
              index={i}
              totalParticipants={leftParticipants.length}
            />
          ))}
        </div>
      </div>

      {/* Right column */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          bottom: "8%",
          right: 0,
          width: "22%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 10px",
          gap: 16,
          zIndex: 5,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns,
            gap: 16,
            justifyItems: "center",
            width: "100%",
          }}
        >
          {rightParticipants.map((p, i) => (
            <ParticipantTile
              key={p.isOther ? "other-right" : p.discordId}
              participant={p as any}
              layout={layout}
              index={i}
              totalParticipants={rightParticipants.length}
            />
          ))}
        </div>
      </div>
    </>
  );
}