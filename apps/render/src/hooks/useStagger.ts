import { useVideoConfig } from "remotion";
import { staggerFrames } from "../utils/interpolation";

export function useStagger(
  index: number,
  baseStartMs: number,
  staggerMs: number
): number {
  const { fps } = useVideoConfig();
  const baseStartFrame = Math.round((baseStartMs / 1000) * fps);
  return staggerFrames(index, baseStartFrame, staggerMs, fps);
}