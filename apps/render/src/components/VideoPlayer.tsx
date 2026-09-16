import { OffthreadVideo, useVideoConfig } from "remotion";
import { RenderInputProps } from "../types";

interface VideoPlayerProps {
  props: RenderInputProps;
}

export function VideoPlayer({ props }: VideoPlayerProps) {
  const { fps } = useVideoConfig();
  const { songData, videoCdnPrefix } = props;
  const { song } = songData;

  const videoSrc = `${videoCdnPrefix}${song.videoUrl}`;

  // Play the range [clipStartSeconds, clipStartSeconds + clipDurationSeconds)
  // of the source file, in frames.
  const trimBefore = Math.max(0, Math.round((song.clipStartSeconds || 0) * fps));
  const trimAfter = Math.round((song.clipStartSeconds + song.clipDurationSeconds) * fps);

  return (
    <OffthreadVideo
      src={videoSrc}
      trimBefore={trimBefore}
      trimAfter={trimAfter}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
      }}
    />
  );
}