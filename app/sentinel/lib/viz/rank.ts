// Sentinel viz - ranking. Pure.

/** Best first. Rank 1 is the best value in the direction that matters; ties share a rank (1, 2, 2, 4). */
export function ordinalRank<T extends { value: number }>(rows: T[], want: "higher" | "lower"): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => (want === "higher" ? b.value - a.value : a.value - b.value));
  return sorted.map((r) => {
    const firstEqual = sorted.findIndex((x) => x.value === r.value);
    return { ...r, rank: firstEqual + 1 };
  });
}
