import { rrfFuse } from '../fusion';
import type { SearchResult } from '@/lib/vectorstore/pineconeStore';

// Helper to build a minimal SearchResult
function makeResult(id: string, score: number): SearchResult {
  return {
    chunk: {
      id,
      nodeId: id,
      pageId: `page-${id}`,
      title: `Title ${id}`,
      content: `Content for ${id}`,
      chunkIndex: 0,
      tokenEstimate: 100,
      embedVersion: 'v1',
      piiFlag: false,
    },
    score,
  };
}

describe('rrfFuse', () => {
  // --- Basic correctness ---
  it('returns empty array for empty input', () => {
    expect(rrfFuse([])).toEqual([]);
  });

  it('returns empty array for a list of empty lists', () => {
    expect(rrfFuse([[], []])).toEqual([]);
  });

  it('passes through a single ranked list, replacing score with RRF score', () => {
    const list = [makeResult('a', 0.9), makeResult('b', 0.5)];
    const result = rrfFuse([list]);

    expect(result).toHaveLength(2);
    // Rank 0 in list => RRF = 1/(60 + 0 + 1) = 1/61
    expect(result[0].score).toBeCloseTo(1 / 61);
    // Rank 1 in list => RRF = 1/(60 + 1 + 1) = 1/62
    expect(result[1].score).toBeCloseTo(1 / 62);
  });

  it('preserves order by RRF score (highest first) for single list', () => {
    const list = [makeResult('a', 1.0), makeResult('b', 0.5), makeResult('c', 0.1)];
    const result = rrfFuse([list]);

    const scores = result.map((r) => r.score);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    expect(scores[1]).toBeGreaterThan(scores[2]);
  });

  // --- Merging multiple lists ---
  it('merges two lists and accumulates scores for shared documents', () => {
    const listA = [makeResult('x', 0.9), makeResult('y', 0.5)];
    const listB = [makeResult('x', 0.8), makeResult('z', 0.3)];

    const result = rrfFuse([listA, listB]);

    // 'x' appears in both lists => higher combined score
    const xEntry = result.find((r) => r.chunk.id === 'x')!;
    const yEntry = result.find((r) => r.chunk.id === 'y')!;
    const zEntry = result.find((r) => r.chunk.id === 'z')!;

    expect(xEntry).toBeDefined();
    expect(yEntry).toBeDefined();
    expect(zEntry).toBeDefined();

    // x is rank 0 in both lists => score = 1/61 + 1/61
    expect(xEntry.score).toBeCloseTo(1 / 61 + 1 / 61);
    // y is rank 1 in listA only => score = 1/62
    expect(yEntry.score).toBeCloseTo(1 / 62);
    // z is rank 1 in listB only => score = 1/62
    expect(zEntry.score).toBeCloseTo(1 / 62);
  });

  it('ranks documents appearing in multiple lists above those in one list', () => {
    // 'shared' is at rank 4 in both lists (low individual scores)
    // 'top' is at rank 0 in one list only
    const listA: SearchResult[] = [
      makeResult('top', 1.0),
      makeResult('b', 0.9),
      makeResult('c', 0.8),
      makeResult('d', 0.7),
      makeResult('shared', 0.1),
    ];
    const listB: SearchResult[] = [
      makeResult('e', 1.0),
      makeResult('f', 0.9),
      makeResult('g', 0.8),
      makeResult('h', 0.7),
      makeResult('shared', 0.1),
    ];

    const result = rrfFuse([listA, listB]);

    const sharedEntry = result.find((r) => r.chunk.id === 'shared')!;
    const topEntry = result.find((r) => r.chunk.id === 'top')!;

    // shared = 1/65 + 1/65 ≈ 0.0308
    // top = 1/61 ≈ 0.0164
    expect(sharedEntry.score).toBeGreaterThan(topEntry.score);
  });

  it('preserves all unique chunks from all lists', () => {
    const listA = [makeResult('a', 1.0), makeResult('b', 0.5)];
    const listB = [makeResult('c', 1.0), makeResult('d', 0.5)];
    const listC = [makeResult('e', 1.0)];

    const result = rrfFuse([listA, listB, listC]);
    const ids = result.map((r) => r.chunk.id);

    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).toContain('d');
    expect(ids).toContain('e');
    expect(result).toHaveLength(5);
  });

  it('replaces original score with RRF score', () => {
    const list = [makeResult('a', 999)]; // artificially high original score
    const result = rrfFuse([list]);

    // original score (999) must NOT appear — only RRF score
    expect(result[0].score).toBeCloseTo(1 / 61);
    expect(result[0].score).not.toBe(999);
  });

  // --- Custom k value ---
  it('respects custom k value in config', () => {
    const list = [makeResult('a', 1.0)];

    const defaultResult = rrfFuse([list]); // k=60
    const customResult = rrfFuse([list], { k: 10 }); // k=10

    // k=10: score = 1/(10+0+1) = 1/11 ≈ 0.0909
    // k=60: score = 1/(60+0+1) = 1/61 ≈ 0.0164
    expect(customResult[0].score).toBeCloseTo(1 / 11);
    expect(defaultResult[0].score).toBeCloseTo(1 / 61);
    expect(customResult[0].score).toBeGreaterThan(defaultResult[0].score);
  });

  it('uses k=60 as default', () => {
    const list = [makeResult('a', 1.0)];
    const result = rrfFuse([list]);
    expect(result[0].score).toBeCloseTo(1 / 61);
  });

  // --- Deduplication ---
  it('deduplicates documents appearing in multiple lists (uses first occurrence chunk)', () => {
    const chunkA = makeResult('dup', 0.9);
    const chunkB = makeResult('dup', 0.5); // same id, different score

    const result = rrfFuse([[chunkA], [chunkB]]);

    // Only one entry for 'dup'
    const dupEntries = result.filter((r) => r.chunk.id === 'dup');
    expect(dupEntries).toHaveLength(1);
  });

  it('handles three lists with complete overlap', () => {
    const listA = [makeResult('only', 1.0)];
    const listB = [makeResult('only', 0.8)];
    const listC = [makeResult('only', 0.6)];

    const result = rrfFuse([listA, listB, listC]);
    expect(result).toHaveLength(1);
    // score = 1/61 * 3
    expect(result[0].score).toBeCloseTo(3 / 61);
  });

  // --- Chunk data preservation ---
  it('preserves chunk metadata from the first-seen occurrence', () => {
    const result = makeResult('abc', 0.9);
    result.chunk.title = 'Special Title';

    const fused = rrfFuse([[result]]);
    expect(fused[0].chunk.title).toBe('Special Title');
    expect(fused[0].chunk.pageId).toBe('page-abc');
    expect(fused[0].chunk.piiFlag).toBe(false);
  });

  // --- Scale invariance ---
  it('is scale-invariant: same rank yields same RRF score regardless of original score magnitude', () => {
    const list1 = [makeResult('a', 1000000)]; // huge score
    const list2 = [makeResult('b', 0.0001)]; // tiny score

    const result = rrfFuse([list1, list2]);
    // Both are rank 0 in their respective lists => same RRF score
    expect(result[0].score).toBeCloseTo(result[1].score);
  });
});
