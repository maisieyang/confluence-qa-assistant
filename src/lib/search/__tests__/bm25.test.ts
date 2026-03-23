import {
  buildBM25Index,
  BM25Searcher,
  incrementalUpdateBM25Index,
  resetBM25Searcher,
  type BM25IndexData,
} from '../bm25';
import type { PageChunk } from '@/lib/confluence/chunk';

// Helper to create a minimal PageChunk
function makeChunk(
  id: string,
  pageId: string,
  content: string,
  title = 'Test Page',
  heading?: string,
): PageChunk {
  return {
    id,
    nodeId: id,
    pageId,
    chunkIndex: 0,
    content,
    tokenEstimate: content.split(' ').length,
    title,
    heading,
    headingPath: [],
    headingPathString: '',
    embedVersion: 'v1',
    piiFlag: false,
  };
}

// ─── buildBM25Index ───────────────────────────────────────────────────────────

describe('buildBM25Index', () => {
  it('returns a valid index structure for empty chunks', () => {
    const index = buildBM25Index([]);
    expect(index.version).toBe(2);
    expect(index.docCount).toBe(0);
    expect(index.avgDocLength).toBe(0);
    expect(index.docs).toHaveLength(0);
    expect(index.invertedIndex).toEqual({});
  });

  it('sets version to 2', () => {
    const index = buildBM25Index([makeChunk('c1', 'p1', 'hello world')]);
    expect(index.version).toBe(2);
  });

  it('records correct docCount', () => {
    const chunks = [
      makeChunk('c1', 'p1', 'alpha beta'),
      makeChunk('c2', 'p2', 'gamma delta'),
      makeChunk('c3', 'p3', 'epsilon zeta'),
    ];
    const index = buildBM25Index(chunks);
    expect(index.docCount).toBe(3);
    expect(index.docs).toHaveLength(3);
  });

  it('computes avgDocLength as average of content token counts', () => {
    // "machine learning" → 2 tokens, "deep neural network" → 3 tokens
    const chunks = [
      makeChunk('c1', 'p1', 'machine learning'),
      makeChunk('c2', 'p2', 'deep neural network'),
    ];
    const index = buildBM25Index(chunks);
    // tokenize('machine learning') -> ['machine', 'learning'] = 2 tokens
    // tokenize('deep neural network') -> ['deep', 'neural', 'network'] = 3 tokens
    // avg = (2 + 3) / 2 = 2.5
    expect(index.avgDocLength).toBeCloseTo(2.5);
  });

  it('stores doc metadata from chunks', () => {
    const chunk = makeChunk('node-1', 'page-1', 'content text', 'My Title', 'Section A');
    const index = buildBM25Index([chunk]);
    const doc = index.docs[0];

    expect(doc.id).toBe('node-1');
    expect(doc.pageId).toBe('page-1');
    expect(doc.title).toBe('My Title');
    expect(doc.heading).toBe('Section A');
    expect(doc.content).toBe('content text');
    expect(doc.piiFlag).toBe(false);
  });

  it('builds inverted index with correct postings', () => {
    const chunks = [
      makeChunk('c1', 'p1', 'machine learning algorithm'),
      makeChunk('c2', 'p2', 'deep learning neural network'),
    ];
    const index = buildBM25Index(chunks);

    // 'learning' appears in both docs
    expect(index.invertedIndex['learning']).toHaveLength(2);
    // 'machine' appears only in doc 0
    expect(index.invertedIndex['machine']).toHaveLength(1);
    expect(index.invertedIndex['machine'][0].docIndex).toBe(0);
  });

  it('stores correct tf in inverted index', () => {
    // 'search search search' → tf('search') = 3
    const chunk = makeChunk('c1', 'p1', 'search search search result');
    const index = buildBM25Index([chunk]);

    const postings = index.invertedIndex['search'];
    expect(postings).toBeDefined();
    expect(postings[0].tf).toBe(3);
  });

  it('stores title tf in postings for v2 index', () => {
    const chunk = makeChunk('c1', 'p1', 'some content', 'Search Engine');
    const index = buildBM25Index([chunk]);

    // 'search' appears in title but not content
    const postings = index.invertedIndex['search'];
    expect(postings).toBeDefined();
    expect(postings[0].titleTf).toBe(1);
  });

  it('stores heading tf in postings for v2 index', () => {
    const chunk = makeChunk('c1', 'p1', 'some content', 'Title', 'Algorithm Overview');
    const index = buildBM25Index([chunk]);

    // 'algorithm' appears in heading
    const postings = index.invertedIndex['algorithm'];
    expect(postings).toBeDefined();
    expect(postings[0].headingTf).toBe(1);
  });

  it('does not include titleTf when term not in title', () => {
    const chunk = makeChunk('c1', 'p1', 'unique content word', 'Different Title');
    const index = buildBM25Index([chunk]);

    const postings = index.invertedIndex['unique'];
    expect(postings[0].titleTf).toBeUndefined();
  });
});

// ─── BM25Searcher ─────────────────────────────────────────────────────────────

describe('BM25Searcher', () => {
  const chunks = [
    makeChunk('c1', 'p1', 'machine learning algorithm classification', 'ML Basics'),
    makeChunk('c2', 'p2', 'deep learning neural network architecture', 'Neural Nets'),
    makeChunk('c3', 'p3', 'natural language processing text classification', 'NLP Guide'),
    makeChunk('c4', 'p4', 'database query optimization index', 'DB Guide'),
  ];
  let index: BM25IndexData;
  let searcher: BM25Searcher;

  beforeEach(() => {
    index = buildBM25Index(chunks);
    searcher = new BM25Searcher(index);
  });

  it('returns empty array for empty query', () => {
    expect(searcher.search('')).toEqual([]);
  });

  it('returns empty array for a stopword-only query', () => {
    // 'the a is' → all stopwords → tokenize returns []
    expect(searcher.search('the a is')).toEqual([]);
  });

  it('returns results sorted by descending score', () => {
    const results = searcher.search('classification');
    const scores = results.map((r) => r.score);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });

  it('returns correct chunk for a unique term', () => {
    // 'database' only appears in c4
    const results = searcher.search('database');
    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe('c4');
  });

  it('returns multiple results for shared terms', () => {
    // 'learning' appears in c1 and c2
    const results = searcher.search('learning');
    const ids = results.map((r) => r.chunk.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).not.toContain('c4');
  });

  it('scores higher for more term matches', () => {
    // c3 has 'text' and 'classification', query hits both terms in c3
    const results = searcher.search('text classification');
    const c3 = results.find((r) => r.chunk.id === 'c3')!;
    const c1 = results.find((r) => r.chunk.id === 'c1')!;

    expect(c3).toBeDefined();
    expect(c1).toBeDefined();
    // c3 has both 'text' and 'classification', c1 only has 'classification'
    expect(c3.score).toBeGreaterThan(c1.score);
  });

  it('respects topK parameter', () => {
    const results = searcher.search('learning classification network', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returns all matching results when topK is large', () => {
    const results = searcher.search('learning', 100);
    expect(results.length).toBeLessThanOrEqual(chunks.length);
  });

  it('returns SearchResult objects with chunk and score', () => {
    const results = searcher.search('database');
    expect(results[0]).toHaveProperty('chunk');
    expect(results[0]).toHaveProperty('score');
    expect(typeof results[0].score).toBe('number');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('preserves chunk fields in search results', () => {
    const results = searcher.search('database');
    const chunk = results[0].chunk;

    expect(chunk.id).toBe('c4');
    expect(chunk.nodeId).toBe('c4');
    expect(chunk.pageId).toBe('p4');
    expect(chunk.title).toBe('DB Guide');
    expect(chunk.content).toContain('database');
    expect(chunk.piiFlag).toBe(false);
  });

  it('all result scores are positive', () => {
    const results = searcher.search('learning');
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('gives field boost advantage to title matches', () => {
    // c2 has 'neural' in title ('Neural Nets') and content
    // c2 should score higher than a doc with 'neural' only in content
    const chunksWithFieldBoost = [
      makeChunk('content-only', 'p1', 'neural network architecture'),
      makeChunk('title-match', 'p2', 'architecture overview', 'Neural Networks'),
    ];
    const boostIndex = buildBM25Index(chunksWithFieldBoost);
    const boostSearcher = new BM25Searcher(boostIndex);

    const results = boostSearcher.search('neural');
    const titleMatchResult = results.find((r) => r.chunk.id === 'title-match')!;
    const contentResult = results.find((r) => r.chunk.id === 'content-only')!;

    expect(titleMatchResult).toBeDefined();
    expect(contentResult).toBeDefined();
    expect(titleMatchResult.score).toBeGreaterThan(contentResult.score);
  });

  it('handles v1 index (no field boosting)', () => {
    const v1Index: BM25IndexData = {
      ...index,
      version: 1,
    };
    const v1Searcher = new BM25Searcher(v1Index);
    const results = v1Searcher.search('learning');
    // Should still return results without crashing
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('returns empty array when no query terms are in the index', () => {
    const results = searcher.search('xyznonexistentterm');
    expect(results).toEqual([]);
  });

  it('handles single-document index correctly', () => {
    const singleIndex = buildBM25Index([makeChunk('solo', 'p1', 'unique solo content')]);
    const singleSearcher = new BM25Searcher(singleIndex);
    const results = singleSearcher.search('solo');
    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe('solo');
  });
});

// ─── incrementalUpdateBM25Index ───────────────────────────────────────────────

describe('incrementalUpdateBM25Index', () => {
  const originalChunks = [
    makeChunk('c1', 'p1', 'machine learning basics', 'ML Intro'),
    makeChunk('c2', 'p2', 'deep learning architecture', 'DL Arch'),
    makeChunk('c3', 'p3', 'natural language processing', 'NLP'),
  ];

  it('builds from scratch when existing index is null', () => {
    const newChunks = [makeChunk('c1', 'p1', 'fresh content')];
    const result = incrementalUpdateBM25Index(null, new Set(['p1']), newChunks);

    expect(result.docCount).toBe(1);
    expect(result.docs[0].id).toBe('c1');
  });

  it('removes docs for changed pages', () => {
    const existing = buildBM25Index(originalChunks);
    const result = incrementalUpdateBM25Index(existing, new Set(['p1']), []);

    // p1 chunk removed, p2 and p3 remain
    expect(result.docCount).toBe(2);
    const ids = result.docs.map((d) => d.id);
    expect(ids).not.toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
  });

  it('appends new chunks to the kept docs', () => {
    const existing = buildBM25Index(originalChunks);
    const newChunk = makeChunk('c4', 'p1', 'updated machine learning content', 'ML Updated');

    const result = incrementalUpdateBM25Index(existing, new Set(['p1']), [newChunk]);

    expect(result.docCount).toBe(3); // c2, c3 kept + c4 new
    const ids = result.docs.map((d) => d.id);
    expect(ids).not.toContain('c1');
    expect(ids).toContain('c4');
  });

  it('replaces multiple pages at once', () => {
    const existing = buildBM25Index(originalChunks);
    const newChunks = [
      makeChunk('new1', 'p1', 'updated p1 content'),
      makeChunk('new2', 'p2', 'updated p2 content'),
    ];

    const result = incrementalUpdateBM25Index(existing, new Set(['p1', 'p2']), newChunks);

    expect(result.docCount).toBe(3); // c3 kept + 2 new
    const ids = result.docs.map((d) => d.id);
    expect(ids).not.toContain('c1');
    expect(ids).not.toContain('c2');
    expect(ids).toContain('c3');
    expect(ids).toContain('new1');
    expect(ids).toContain('new2');
  });

  it('keeps all docs when changedPageIds is empty set', () => {
    const existing = buildBM25Index(originalChunks);
    const result = incrementalUpdateBM25Index(existing, new Set(), []);

    expect(result.docCount).toBe(3);
  });

  it('removes all docs when all pageIds are in changedPageIds', () => {
    const existing = buildBM25Index(originalChunks);
    const result = incrementalUpdateBM25Index(
      existing,
      new Set(['p1', 'p2', 'p3']),
      [],
    );

    expect(result.docCount).toBe(0);
    expect(result.docs).toHaveLength(0);
  });

  it('resulting index is searchable', () => {
    const existing = buildBM25Index(originalChunks);
    const newChunk = makeChunk('c4', 'p1', 'quantum computing algorithms');

    const updated = incrementalUpdateBM25Index(existing, new Set(['p1']), [newChunk]);
    const searcher = new BM25Searcher(updated);

    // New content should be findable
    const results = searcher.search('quantum');
    expect(results).toHaveLength(1);
    expect(results[0].chunk.id).toBe('c4');

    // Old content from kept pages should still be findable
    const nlpResults = searcher.search('language');
    expect(nlpResults.length).toBeGreaterThan(0);
    const ids = nlpResults.map((r) => r.chunk.id);
    expect(ids).toContain('c3');
  });

  it('returns a v2 index', () => {
    const existing = buildBM25Index(originalChunks);
    const result = incrementalUpdateBM25Index(existing, new Set(['p1']), []);
    expect(result.version).toBe(2);
  });
});

// ─── resetBM25Searcher ────────────────────────────────────────────────────────

describe('resetBM25Searcher', () => {
  it('is a callable function that does not throw', () => {
    expect(() => resetBM25Searcher()).not.toThrow();
  });

  it('can be called multiple times without error', () => {
    resetBM25Searcher();
    resetBM25Searcher();
    resetBM25Searcher();
    // No assertions needed — just ensuring no errors
  });
});
