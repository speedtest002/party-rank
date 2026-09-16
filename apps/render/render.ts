import { renderMedia, selectComposition } from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RenderOptions {
  prId: string;
  annSongId: number;
  inputProps: any;
  outputDir: string;
  videoCdnPrefix: string;
}

async function renderSongVideo(options: RenderOptions): Promise<string> {
  const { prId, annSongId, inputProps, outputDir, videoCdnPrefix } = options;

  const compositionId = "SongScene";
  const outputFileName = `${prId}-${annSongId}.mp4`;
  const outputPath = path.join(outputDir, outputFileName);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`[render] Bundling composition...`);
  const bundlePath = await bundle({ entryPoint: path.join(__dirname, "src/index.ts") });

  console.log(`[render] Selecting composition...`);
  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: compositionId,
    inputProps: { songData: inputProps.songData, videoCdnPrefix },
  });

  console.log(`[render] Rendering ${composition.durationInFrames} frames @ ${composition.fps}fps...`);
  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: { songData: inputProps.songData, videoCdnPrefix },
    onProgress: (progress: { progress: number; renderedFrames: number }) => {
      if (progress.renderedFrames % 30 === 0) {
        console.log(`[render] Progress: ${Math.round(progress.progress * 100)}%`);
      }
    },
  });

  console.log(`[render] Done! Output: ${outputPath}`);
  return outputFileName;
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 5) {
    console.error("Usage: tsx render.ts <prId> <annSongId> <render-data-json> <output-dir> <video-cdn-prefix>");
    process.exit(1);
  }

  const [prId, annSongIdStr, renderDataPath, outputDir, videoCdnPrefix] = args;
  const annSongId = parseInt(annSongIdStr, 10);

  const renderData = JSON.parse(fs.readFileSync(renderDataPath, "utf-8"));
  const songData = Array.isArray(renderData) ? renderData.find((s: any) => s.song.annSongId === annSongId) : renderData;

  if (!songData) {
    console.error(`[render] Song ${annSongId} not found in render data`);
    process.exit(1);
  }

  await renderSongVideo({
    prId,
    annSongId,
    inputProps: { songData },
    outputDir,
    videoCdnPrefix,
  });
}

main().catch((err) => {
  console.error("[render] Fatal error:", err);
  process.exit(1);
});