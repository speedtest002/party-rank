import { useVideoConfig } from "remotion";
import { RenderInputProps } from "../types";

interface VideoPlayerProps {
  props: RenderInputProps;
}

export function VideoPlayer({ props }: VideoPlayerProps) {
  const { fps, durationInFrames } = useVideoConfig();
  const { songData, videoCdnPrefix } = props;
  const { song } = songData;

  const videoSrc = `${videoCdnPrefix}${song.videoUrl}`;
  const totalFrames = Math.round(song.clipDurationSeconds * fps);

  return (
    <video
      src={videoSrc}
      autoPlay
      loop
      muted={false}
      playsInline
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