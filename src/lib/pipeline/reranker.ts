import type { SearchResult } from '../vectorstore';

const JINA_RERANK_URL = 'https://api.jina.ai/v1/rerank';

function getJinaConfig() {
  return {
    apiKey: process.env.JINA_API_KEY ?? '',
    model: process.env.JINA_RERANK_MODEL ?? 'jina-reranker-v2-base-multilingual',
    trace: /^(1|true|yes)$/i.test(process.env.QA_TRACE_RERANK ?? process.env.QA_TRACE_RETRIEVAL ?? ''),
  };
}

export interface RerankResult {
  results: SearchResult[];
  rerankerScores: number[];
  latencyMs: number;
}

interface JinaRerankResponse {
  results: Array<{
    index: number;
    relevance_score: number;
  }>;
}

/**
 * Rerank search results using Jina Reranker (Cross-Encoder).
 * Sends query + document pairs to Jina API, returns results sorted by relevance_score.
 */
export async function rerank(
  query: string,
  results: SearchResult[],
  topK: number = 5,
): Promise<RerankResult> {
  if (results.length === 0) {
    return { results: [], rerankerScores: [], latencyMs: 0 };
  }

  if (results.length <= topK) {
    return { results, rerankerScores: results.map(() => -1), latencyMs: 0 };
  }

  const config = getJinaConfig();

  if (!config.apiKey) {
    console.warn('Reranker: JINA_API_KEY not set, skipping rerank');
    return { results: results.slice(0, topK), rerankerScores: results.slice(0, topK).map(() => -1), latencyMs: 0 };
  }

  const start = Date.now();

  // Prepare documents — send chunk content (truncated to 1000 chars for efficiency)
  const documents = results.map((r) => r.chunk.content.substring(0, 1000));

  try {
    const response = await fetch(JINA_RERANK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        query,
        documents,
        top_n: topK,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Reranker: Jina API error ${response.status}: ${errorText}`);
      return { results: results.slice(0, topK), rerankerScores: results.slice(0, topK).map(() => -1), latencyMs: Date.now() - start };
    }

    const data = (await response.json()) as JinaRerankResponse;
    const latencyMs = Date.now() - start;

    // Map Jina results back to our SearchResult objects
    const reranked = data.results.map((jr) => ({
      result: results[jr.index],
      score: jr.relevance_score,
    }));

    if (config.trace) {
      // Build full trace including non-selected results
      const selectedIndices = new Set(data.results.map((r) => r.index));
      const allScored = data.results.map((jr, rank) => ({
        rank: rank + 1,
        title: results[jr.index].chunk.title,
        heading: results[jr.index].chunk.heading,
        vectorScore: Number(results[jr.index].score.toFixed(4)),
        rerankerScore: Number(jr.relevance_score.toFixed(4)),
        included: true,
      }));

      console.debug(JSON.stringify({
        type: 'reranker',
        provider: 'jina',
        model: config.model,
        query,
        latencyMs,
        topK,
        inputCount: results.length,
        scores: allScored,
      }));
    }

    return {
      results: reranked.map((p) => p.result),
      rerankerScores: reranked.map((p) => p.score),
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    console.warn('Reranker: Jina API call failed:', error instanceof Error ? error.message : String(error));
    return { results: results.slice(0, topK), rerankerScores: results.slice(0, topK).map(() => -1), latencyMs };
  }
}
