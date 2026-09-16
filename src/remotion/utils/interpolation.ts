import { interpolate } from "remotion";

export function countUp(
  frame: number,
  fps: number,
  startFrame: number,
  endFrame: number,
  targetValue: number,
  decimals = 1
): number {
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
  const value = targetValue * eased;
  return Number(value.toFixed(decimals));
}

export function fadeIn(
  frame: number,
  fps: number,
  startFrame: number,
  endFrame: number
): number {
  return interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function slideInY(
  frame: number,
  fps: number,
  startFrame: number,
  endFrame: number,
  startY: number,
  endY: number
): number {
  return interpolate(frame, [startFrame, endFrame], [startY, endY], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export function scaleBounce(
  frame: number,
  fps: number,
  startFrame: number,
  endFrame: number
): number {
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Elastic ease out approximation
  return 1 + 0.1 * Math.sin(progress * Math.PI * 6) * Math.pow(1 - progress, 2);
}

export function staggerFrames(
  index: number,
  baseStartFrame: number,
  staggerMs: number,
  fps: number
): number {
  const staggerFrames = Math.round((staggerMs / 1000) * fps);
  return baseStartFrame + index * staggerFrames;
}