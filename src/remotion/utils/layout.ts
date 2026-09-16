export interface GridLayout {
  colsPerSide: number;
  tileSize: number;
  fontSizeName: number;
  fontSizeScore: number;
  maxVisible: number;
}

export function calculateGridLayout(participantCount: number): GridLayout {
  if (participantCount <= 8) {
    return {
      colsPerSide: 1,
      tileSize: 140,
      fontSizeName: 18,
      fontSizeScore: 28,
      maxVisible: participantCount,
    };
  }
  if (participantCount <= 20) {
    return {
      colsPerSide: 2,
      tileSize: 100,
      fontSizeName: 16,
      fontSizeScore: 24,
      maxVisible: participantCount,
    };
  }
  if (participantCount <= 40) {
    return {
      colsPerSide: 3,
      tileSize: 75,
      fontSizeName: 14,
      fontSizeScore: 20,
      maxVisible: participantCount,
    };
  }
  // > 40: show top 40 outliers + "+N others"
  return {
    colsPerSide: 3,
    tileSize: 75,
    fontSizeName: 14,
    fontSizeScore: 20,
    maxVisible: 40,
  };
}

export function getVisibleParticipants<T extends { score: number }>(
  participants: T[],
  maxVisible: number
): (T & { isOther: boolean })[] {
  if (participants.length <= maxVisible) {
    return participants.map((p) => ({ ...p, isOther: false }));
  }

  // Calculate average score
  const avgScore =
    participants.reduce((sum, p) => sum + p.score, 0) / participants.length;

  // Sort by distance from average (descending) - outliers first
  const sorted = [...participants].sort(
    (a, b) => Math.abs(b.score - avgScore) - Math.abs(a.score - avgScore)
  );

  const visible = sorted.slice(0, maxVisible).map((p) => ({ ...p, isOther: false }));
  const otherCount = participants.length - maxVisible;

  return [...visible, { ...sorted[maxVisible], isOther: true, score: otherCount } as any];
}