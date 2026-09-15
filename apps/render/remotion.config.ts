import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p");

export const remotionConfig = {
  width: 1920,
  height: 1080,
  fps: 23.976, // 23.98fps as specified
  durationInFrames: 8 * 23.976, // default 8 seconds, will be overridden per song
};