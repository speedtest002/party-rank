import { useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { RenderInputProps } from "../types";

interface VideoPlayerProps {
  props: RenderInputProps;
}

export function VideoPlayer({ props }: VideoPlayerProps) {
  const { fps } = useVideoConfig();
  const { songData, videoCdnPrefix } = props;
  const { song } = songData;

  if (!song.videoUrl) return null;

  const videoSrc = `${videoCdnPrefix}${song.videoUrl}`;

  const trimBefore = Math.max(0, Math.round((song.clipStartSeconds || 0) * fps));
  const trimAfter = Math.round((song.clipStartSeconds + song.clipDurationSeconds) * fps);

  return (
    <Video
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
