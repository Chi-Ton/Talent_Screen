export function formatCandidateScore(value: number | null | undefined) {
  return value === null || value === undefined ? "Not scored" : `${Number(value.toFixed(2))}%`;
}
