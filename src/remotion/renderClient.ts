import { renderMediaOnWeb } from "@remotion/web-renderer";
import { SongScene } from "./SongScene";
import type { SongData } from "./types";

export const FPS = 23.976;

interface RenderProgress {
  renderedFrames: number;
  encodedFrames: number;
  progress: number;
}

export async function renderSongClient(
  songData: SongData,
  videoCdnPrefix: string,
  onProgress?: (data: RenderProgress) => void,
): Promise<Blob> {
  const clip = songData.song;
  const durationInFrames = Math.max(1, Math.round(clip.clipDurationSeconds * FPS));

  const { getBlob } = await renderMediaOnWeb({
    composition: {
      id: `SongScene-${clip.annSongId}`,
      component: SongScene as any,
      durationInFrames,
      fps: FPS,
      width: 1920,
      height: 1080,
      defaultProps: { songData, videoCdnPrefix },
    },
    inputProps: { songData, videoCdnPrefix },
    container: "mp4",
    videoCodec: "h264",
    onProgress: (onProgress as any) ?? (() => {}),
  });

  return getBlob();
}
