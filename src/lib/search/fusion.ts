import type { SearchResult } from '../vectorstore/pineconeStore';

export interface RRFConfig {
  /** Smoothing constant, default 60. Higher = more equal weighting across ranks. */
  k: number;
}

const DEFAULT_RRF_CONFIG: RRFConfig = { k: 60 };

/**
 * Reciprocal Rank Fusion — merges multiple ranked lists into one.
 *
 * For each document: RRF_score = Σ 1/(k + rank_i)
 * where rank_i is the 1-indexed position in the i-th list.
 *
 * Documents appearing in multiple lists get higher scores.
 * Scale-invariant — works regardless of the original score ranges.
 */
export function rrfFuse(
  rankedLists: SearchResult[][],
  config: RRFConfig = DEFAULT_RRF_CONFIG,
): SearchResult[] {
  const { k } = config;
  const scoreMap = new Map<string, { result: SearchResult; rrfScore: number }>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const result = list[rank];
      const chunkId = result.chunk.id;
      const rrfContribution = 1 / (k + rank + 1); // rank is 1-indexed

      const existing = scoreMap.get(chunkId);
      if (existing) {
        existing.rrfScore += rrfContribution;
      } else {
        scoreMap.set(chunkId, { result, rrfScore: rrfContribution });
      }
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((entry) => ({
      ...entry.result,
      score: entry.rrfScore, // Replace original score with RRF score
    }));
}
