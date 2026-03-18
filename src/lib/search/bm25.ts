import { promises as fs } from 'node:fs';
import { tokenize } from './tokenizer';
import type { SearchResult, RetrievedChunk } from '../vectorstore/pineconeStore';
import type { PageChunk } from '../confluence/chunk';

// BM25 parameters (classic defaults)
const K1 = 1.2;
const B = 0.75;

// Field boost weights — title/heading matches are more important than body matches.
const TITLE_BOOST = 3.0;
const HEADING_BOOST = 2.0;
const CONTENT_BOOST = 1.0;

// --- Index data structures (serializable to JSON) ---

interface BM25PostingEntry {
  docIndex: number;
  /** Term frequency in body content */
  tf: number;
  /** Term frequency in title (boosted at query time) */
  titleTf?: number;
  /** Term frequency in heading (boosted at query time) */
  headingTf?: number;
}

interface BM25DocEntry {
  id: string;
  pageId: string;
  title: string;
  heading?: string;
  headingPath?: string;
  content: string;
  sourceUrl?: string;
  chunkIndex: number;
  tokenEstimate: number;
  embedVersion: string;
  updatedAt?: string;
  etag?: string;
  spaceKey?: string;
  piiFlag: boolean;
  tokenCount: number;
}

export interface BM25IndexData {
  version: 1 | 2;
  avgDocLength: number;
  docCount: number;
  docs: BM25DocEntry[];
  invertedIndex: Record<string, BM25PostingEntry[]>;
}

// --- Index builder (used at ingestion time) ---

function countTerms(tokens: string[]): Map<string, number> {
  const tfMap = new Map<string, number>();
  for (const token of tokens) {
    tfMap.set(token, (tfMap.get(token) ?? 0) + 1);
  }
  return tfMap;
}

export function buildBM25Index(chunks: PageChunk[]): BM25IndexData {
  const docs: BM25DocEntry[] = [];
  const invertedIndex: Record<string, BM25PostingEntry[]> = {};
  let totalTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Tokenize each field separately for field-level boosting
    const contentTokens = tokenize(chunk.content);
    const titleTokens = tokenize(chunk.title ?? '');
    const headingTokens = tokenize(chunk.heading ?? '');

    const tokenCount = contentTokens.length;
    totalTokens += tokenCount;

    docs.push({
      id: chunk.nodeId,
      pageId: chunk.pageId,
      title: chunk.title,
      heading: chunk.heading,
      headingPath: chunk.headingPathString,
      content: chunk.content,
      sourceUrl: chunk.sourceUrl,
      chunkIndex: chunk.chunkIndex,
      tokenEstimate: chunk.tokenEstimate,
      embedVersion: chunk.embedVersion,
      updatedAt: chunk.updatedAt,
      etag: chunk.etag,
      spaceKey: chunk.spaceKey,
      piiFlag: chunk.piiFlag,
      tokenCount,
    });

    // Count term frequencies per field
    const contentTf = countTerms(contentTokens);
    const titleTf = countTerms(titleTokens);
    const headingTf = countTerms(headingTokens);

    // Merge all terms that appear in any field
    const allTerms = new Set([
      ...contentTf.keys(),
      ...titleTf.keys(),
      ...headingTf.keys(),
    ]);

    for (const term of allTerms) {
      if (!invertedIndex[term]) {
        invertedIndex[term] = [];
      }
      const entry: BM25PostingEntry = {
        docIndex: i,
        tf: contentTf.get(term) ?? 0,
      };
      const tTf = titleTf.get(term);
      if (tTf) entry.titleTf = tTf;
      const hTf = headingTf.get(term);
      if (hTf) entry.headingTf = hTf;

      invertedIndex[term].push(entry);
    }
  }

  return {
    version: 2,
    avgDocLength: chunks.length > 0 ? totalTokens / chunks.length : 0,
    docCount: chunks.length,
    docs,
    invertedIndex,
  };
}

// --- Searcher (used at query time) ---

export class BM25Searcher {
  constructor(private readonly index: BM25IndexData) {}

  search(query: string, topK: number = 15): SearchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const isV2 = this.index.version === 2;
    const scores = new Float64Array(this.index.docCount);

    for (const term of queryTokens) {
      const postings = this.index.invertedIndex[term];
      if (!postings) continue;

      // IDF = ln((N - n + 0.5) / (n + 0.5) + 1)
      const n = postings.length;
      const idf = Math.log((this.index.docCount - n + 0.5) / (n + 0.5) + 1);

      for (const posting of postings) {
        const doc = this.index.docs[posting.docIndex];
        const docLen = doc.tokenCount;
        const avgDl = this.index.avgDocLength;
        const lengthNorm = 1 - B + B * docLen / avgDl;

        if (isV2) {
          // Field-boosted scoring: compute BM25 tfNorm per field, then combine
          const contentTf = posting.tf;
          const titleTf = posting.titleTf ?? 0;
          const headingTf = posting.headingTf ?? 0;

          // Effective TF = weighted sum of field TFs
          const boostedTf =
            CONTENT_BOOST * contentTf +
            TITLE_BOOST * titleTf +
            HEADING_BOOST * headingTf;

          const tfNorm = (boostedTf * (K1 + 1)) / (boostedTf + K1 * lengthNorm);
          scores[posting.docIndex] += idf * tfNorm;
        } else {
          // V1 fallback: flat TF, no field boosting
          const tf = posting.tf;
          const tfNorm = (tf * (K1 + 1)) / (tf + K1 * lengthNorm);
          scores[posting.docIndex] += idf * tfNorm;
        }
      }
    }

    // Get top-K by score
    const indexed = Array.from(scores)
      .map((score, i) => ({ score, index: i }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return indexed.map((item) => {
      const doc = this.index.docs[item.index];
      const chunk: RetrievedChunk = {
        id: doc.id,
        nodeId: doc.id,
        pageId: doc.pageId,
        title: doc.title,
        heading: doc.heading,
        headingPath: doc.headingPath,
        content: doc.content,
        sourceUrl: doc.sourceUrl,
        chunkIndex: doc.chunkIndex,
        tokenEstimate: doc.tokenEstimate,
        embedVersion: doc.embedVersion,
        updatedAt: doc.updatedAt,
        etag: doc.etag,
        spaceKey: doc.spaceKey,
        piiFlag: doc.piiFlag,
      };
      return { chunk, score: item.score };
    });
  }
}

// --- Loader (singleton, lazy) ---

let searcherPromise: Promise<BM25Searcher | null> | null = null;

export async function getBM25Searcher(
  indexPath?: string,
): Promise<BM25Searcher | null> {
  if (!searcherPromise) {
    const path = indexPath ?? process.env.BM25_INDEX_PATH ?? 'data/bm25-index.json';
    searcherPromise = (async () => {
      try {
        const raw = await fs.readFile(path, 'utf-8');
        const data = JSON.parse(raw) as BM25IndexData;
        console.log(`BM25 index loaded (v${data.version}): ${data.docCount} docs, ${Object.keys(data.invertedIndex).length} terms`);
        return new BM25Searcher(data);
      } catch (error) {
        console.warn(
          `BM25 index not available at ${path}, falling back to dense-only search:`,
          error instanceof Error ? error.message : String(error),
        );
        return null;
      }
    })();
  }
  return searcherPromise;
}

/** Reset the singleton (used after re-ingestion) */
export function resetBM25Searcher(): void {
  searcherPromise = null;
}

// --- Incremental update ---

const DEFAULT_BM25_INDEX_PATH = process.env.BM25_INDEX_PATH ?? 'data/bm25-index.json';

/**
 * Load the existing BM25 index from disk, or return null if not found.
 */
export async function loadBM25Index(
  indexPath: string = DEFAULT_BM25_INDEX_PATH,
): Promise<BM25IndexData | null> {
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(raw) as BM25IndexData;
  } catch {
    return null;
  }
}

/**
 * Save a BM25 index to disk.
 */
export async function saveBM25Index(
  index: BM25IndexData,
  indexPath: string = DEFAULT_BM25_INDEX_PATH,
): Promise<void> {
  await fs.writeFile(indexPath, JSON.stringify(index), 'utf-8');
}

/**
 * Incrementally update a BM25 index by replacing chunks for specific pages.
 *
 * Strategy:
 *   1. Remove all docs belonging to changedPageIds from the existing index.
 *   2. Convert kept docs back to a chunk-like shape for re-indexing.
 *   3. Append the new chunks.
 *   4. Rebuild the full invertedIndex and global stats from the merged doc list.
 *
 * Why full invertedIndex rebuild?
 *   - docIndex is positional (array index). Removing docs shifts all subsequent indices.
 *   - Patching every posting entry is O(total postings) anyway — same cost as rebuild.
 *   - For <10k docs, rebuild takes <50ms. Simplicity wins.
 */
export function incrementalUpdateBM25Index(
  existing: BM25IndexData | null,
  changedPageIds: Set<string>,
  newChunks: PageChunk[],
): BM25IndexData {
  // If no existing index, just do a full build
  if (!existing) {
    return buildBM25Index(newChunks);
  }

  // Keep docs that are NOT in the changed set
  const keptDocs = existing.docs.filter((d) => !changedPageIds.has(d.pageId));

  // Convert kept BM25DocEntries to PageChunk-compatible objects for buildBM25Index
  const keptAsChunks: PageChunk[] = keptDocs.map((d) => ({
    id: d.id,
    nodeId: d.id,
    pageId: d.pageId,
    chunkIndex: d.chunkIndex,
    content: d.content,
    tokenEstimate: d.tokenEstimate,
    title: d.title,
    heading: d.heading,
    headingPath: d.headingPath?.split(' > ') ?? [],
    headingPathString: d.headingPath ?? '',
    sourceUrl: d.sourceUrl,
    spaceKey: d.spaceKey,
    updatedAt: d.updatedAt,
    etag: d.etag,
    embedVersion: d.embedVersion,
    piiFlag: d.piiFlag,
  }));

  return buildBM25Index([...keptAsChunks, ...newChunks]);
}
