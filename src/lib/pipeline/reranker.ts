import { chatCompletion, type ProviderName } from '../providers/modelProvider';
import type { SearchResult } from '../vectorstore';

const RERANK_MODEL = process.env.RERANK_MODEL ?? 'qwen-turbo';
const RERANK_PROVIDER: ProviderName = 'qwen';
const TRACE_RERANK = /^(1|true|yes)$/i.test(process.env.QA_TRACE_RERANK ?? process.env.QA_TRACE_RETRIEVAL ?? '');

export interface RerankResult {
  results: SearchResult[];
  rerankerScores: number[];
  latencyMs: number;
}

const RERANK_SYSTEM_PROMPT = `You are a relevance scorer for a search engine. Given a query and a list of document chunks, score each chunk's relevance to the query.

Score from 0 to 10:
- 10: Directly answers the query with specific, relevant information
- 7-9: Highly relevant, contains key information related to the query
- 4-6: Somewhat relevant, tangentially related
- 1-3: Barely relevant, only shares a few keywords
- 0: Completely irrelevant

Return ONLY a JSON array of scores in the same order as the chunks. No explanation.
Example: [8, 3, 10, 1, 6]`;

function buildRerankPrompt(query: string, chunks: SearchResult[]): string {
  const chunkTexts = chunks.map((c, i) =>
    `[Chunk ${i + 1}] (title: ${c.chunk.title})\n${c.chunk.content.substring(0, 500)}`
  ).join('\n\n---\n\n');

  return `Query: "${query}"\n\n${chunkTexts}`;
}

function parseScores(raw: string, expectedCount: number): number[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length === expectedCount) {
      return parsed.map((s) => {
        const n = Number(s);
        return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
      });
    }
  } catch { /* fall through */ }

  // Fallback: try to extract numbers from the response
  const numbers = cleaned.match(/\d+(\.\d+)?/g);
  if (numbers && numbers.length >= expectedCount) {
    return numbers.slice(0, expectedCount).map((n) => {
      const val = Number(n);
      return Number.isFinite(val) ? Math.max(0, Math.min(10, val)) : 0;
    });
  }

  // If parsing completely fails, return original order (no reranking)
  console.warn('Reranker: failed to parse scores, skipping rerank. Raw:', cleaned);
  return Array(expectedCount).fill(-1);
}

/**
 * Rerank search results using LLM-as-judge.
 * Takes the raw Pinecone results and re-scores them based on semantic relevance.
 * Returns results sorted by reranker score (descending).
 */
export async function rerank(
  query: string,
  results: SearchResult[],
  topK: number = 5,
): Promise<RerankResult> {
  if (results.length === 0) {
    return { results: [], rerankerScores: [], latencyMs: 0 };
  }

  // If only a few results, reranking adds cost without much benefit
  if (results.length <= topK) {
    return { results, rerankerScores: results.map(() => -1), latencyMs: 0 };
  }

  const start = Date.now();

  const { text } = await chatCompletion({
    messages: [
      { role: 'system', content: RERANK_SYSTEM_PROMPT },
      { role: 'user', content: buildRerankPrompt(query, results) },
    ],
    temperature: 0,
    model: RERANK_MODEL,
    provider: RERANK_PROVIDER,
  });

  const scores = parseScores(text, results.length);
  const latencyMs = Date.now() - start;

  // If parsing failed (all -1), return original order
  if (scores.every((s) => s === -1)) {
    return { results: results.slice(0, topK), rerankerScores: scores.slice(0, topK), latencyMs };
  }

  // Pair results with scores and sort by reranker score descending
  const paired = results.map((r, i) => ({ result: r, score: scores[i] }));
  paired.sort((a, b) => b.score - a.score);

  const reranked = paired.slice(0, topK);

  if (TRACE_RERANK) {
    console.debug(JSON.stringify({
      type: 'reranker',
      query,
      latencyMs,
      scores: paired.map((p, i) => ({
        rank: i + 1,
        title: p.result.chunk.title,
        heading: p.result.chunk.heading,
        vectorScore: Number(p.result.score.toFixed(4)),
        rerankerScore: p.score,
        included: i < topK,
      })),
    }));
  }

  return {
    results: reranked.map((p) => p.result),
    rerankerScores: reranked.map((p) => p.score),
    latencyMs,
  };
}
