import { promises as fs } from 'node:fs';
import { tokenize } from './tokenizer';
import type { SearchResult, RetrievedChunk } from '../vectorstore/pineconeStore';
import type { PageChunk } from '../confluence/chunk';

// BM25 parameters (classic defaults)
const K1 = 1.2;
const B = 0.75;

// --- Index data structures (serializable to JSON) ---

interface BM25PostingEntry {
  docIndex: number;
  tf: number;
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
  version: 1;
  avgDocLength: number;
  docCount: number;
  docs: BM25DocEntry[];
  invertedIndex: Record<string, BM25PostingEntry[]>;
}

// --- Index builder (used at ingestion time) ---

export function buildBM25Index(chunks: PageChunk[]): BM25IndexData {
  const docs: BM25DocEntry[] = [];
  const invertedIndex: Record<string, BM25PostingEntry[]> = {};
  let totalTokens = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tokens = tokenize(chunk.content);
    const tokenCount = tokens.length;
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

    // Count term frequencies
    const tfMap = new Map<string, number>();
    for (const token of tokens) {
      tfMap.set(token, (tfMap.get(token) ?? 0) + 1);
    }

    for (const [term, tf] of tfMap) {
      if (!invertedIndex[term]) {
        invertedIndex[term] = [];
      }
      invertedIndex[term].push({ docIndex: i, tf });
    }
  }

  return {
    version: 1,
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

    const scores = new Float64Array(this.index.docCount);

    for (const term of queryTokens) {
      const postings = this.index.invertedIndex[term];
      if (!postings) continue;

      // IDF = ln((N - n + 0.5) / (n + 0.5) + 1)
      const n = postings.length;
      const idf = Math.log((this.index.docCount - n + 0.5) / (n + 0.5) + 1);

      for (const posting of postings) {
        const doc = this.index.docs[posting.docIndex];
        const tf = posting.tf;
        const docLen = doc.tokenCount;
        const avgDl = this.index.avgDocLength;

        // BM25 score for this term in this document
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLen / avgDl));
        scores[posting.docIndex] += idf * tfNorm;
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
        console.log(`BM25 index loaded: ${data.docCount} docs, ${Object.keys(data.invertedIndex).length} terms`);
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
