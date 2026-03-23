import { rerank } from '../reranker';
import type { RerankResult } from '../reranker';
import type { SearchResult } from '@/lib/vectorstore';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Build a minimal SearchResult for testing */
function makeSearchResult(id: string, content: string = 'chunk content', score: number = 0.8): SearchResult {
  return {
    chunk: {
      id,
      nodeId: `node-${id}`,
      pageId: `page-${id}`,
      title: `Title ${id}`,
      heading: `Heading ${id}`,
      content,
      chunkIndex: 0,
      tokenEstimate: 100,
      embedVersion: 'v1',
      piiFlag: false,
    },
    score,
  };
}

/** Create a successful Jina API response */
function makeJinaResponse(indexScorePairs: Array<{ index: number; relevance_score: number }>) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ results: indexScorePairs }),
    text: jest.fn().mockResolvedValue(''),
  };
}

describe('rerank', () => {
  const FAKE_API_KEY = 'test-jina-api-key';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JINA_API_KEY = FAKE_API_KEY;
  });

  afterEach(() => {
    delete process.env.JINA_API_KEY;
    delete process.env.JINA_RERANK_MODEL;
    delete process.env.QA_TRACE_RERANK;
    delete process.env.QA_TRACE_RETRIEVAL;
  });

  describe('early-exit conditions', () => {
    it('returns empty result immediately for empty results array', async () => {
      const result = await rerank('query', []);

      expect(result).toEqual<RerankResult>({
        results: [],
        rerankerScores: [],
        latencyMs: 0,
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns results as-is with -1 scores when count <= topK', async () => {
      const results = [makeSearchResult('a'), makeSearchResult('b'), makeSearchResult('c')];
      const topK = 5;

      const result = await rerank('query', results, topK);

      expect(result.results).toEqual(results);
      expect(result.rerankerScores).toEqual([-1, -1, -1]);
      expect(result.latencyMs).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns results as-is when count equals topK exactly', async () => {
      const results = [makeSearchResult('a'), makeSearchResult('b')];
      const result = await rerank('query', results, 2);

      expect(result.results).toEqual(results);
      expect(result.rerankerScores).toHaveLength(2);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('missing API key', () => {
    it('returns first topK results with -1 scores when JINA_API_KEY is not set', async () => {
      delete process.env.JINA_API_KEY;
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));

      const result = await rerank('query', results, 3);

      expect(result.results).toHaveLength(3);
      expect(result.rerankerScores).toEqual([-1, -1, -1]);
      expect(result.latencyMs).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns first topK results with empty JINA_API_KEY string', async () => {
      process.env.JINA_API_KEY = '';
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));

      const result = await rerank('query', results, 3);

      expect(result.results).toHaveLength(3);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('successful API call', () => {
    it('calls Jina API with correct URL and method', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse([
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.88 },
          { index: 5, relevance_score: 0.70 },
          { index: 1, relevance_score: 0.65 },
          { index: 3, relevance_score: 0.50 },
        ]),
      );

      await rerank('test query', results, 5);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.jina.ai/v1/rerank');
      expect(options.method).toBe('POST');
    });

    it('sends Authorization header with Bearer token', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse([{ index: 0, relevance_score: 0.9 }, { index: 1, relevance_score: 0.8 },
          { index: 2, relevance_score: 0.7 }, { index: 3, relevance_score: 0.6 }, { index: 4, relevance_score: 0.5 }]),
      );

      await rerank('query', results, 5);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe(`Bearer ${FAKE_API_KEY}`);
    });

    it('sends correct JSON body with query, documents, topK, and model', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`, `content ${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse([
          { index: 0, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
          { index: 2, relevance_score: 0.7 },
          { index: 3, relevance_score: 0.6 },
          { index: 4, relevance_score: 0.5 },
        ]),
      );

      await rerank('my query', results, 5);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.query).toBe('my query');
      expect(body.top_n).toBe(5);
      expect(body.documents).toHaveLength(6);
      expect(body.documents[0]).toBe('content 0');
    });

    it('truncates document content to 1000 characters', async () => {
      const longContent = 'a'.repeat(2000);
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`, longContent));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse(
          Array.from({ length: 5 }, (_, i) => ({ index: i, relevance_score: 0.9 - i * 0.1 })),
        ),
      );

      await rerank('query', results, 5);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      body.documents.forEach((doc: string) => {
        expect(doc.length).toBeLessThanOrEqual(1000);
      });
    });

    it('returns results in the order returned by Jina (highest score first)', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse([
          { index: 4, relevance_score: 0.99 },
          { index: 1, relevance_score: 0.88 },
          { index: 3, relevance_score: 0.70 },
          { index: 0, relevance_score: 0.55 },
          { index: 2, relevance_score: 0.40 },
        ]),
      );

      const result = await rerank('query', results, 5);

      expect(result.results[0]).toBe(results[4]);
      expect(result.results[1]).toBe(results[1]);
      expect(result.results[2]).toBe(results[3]);
      expect(result.results[3]).toBe(results[0]);
      expect(result.results[4]).toBe(results[2]);
    });

    it('returns matching reranker scores in same order as results', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse([
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.80 },
          { index: 5, relevance_score: 0.65 },
          { index: 1, relevance_score: 0.50 },
          { index: 4, relevance_score: 0.35 },
        ]),
      );

      const result = await rerank('query', results, 5);

      expect(result.rerankerScores).toEqual([0.95, 0.80, 0.65, 0.50, 0.35]);
    });

    it('uses the default model when JINA_RERANK_MODEL is not set', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse(
          Array.from({ length: 5 }, (_, i) => ({ index: i, relevance_score: 0.9 - i * 0.1 })),
        ),
      );

      await rerank('query', results, 5);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('jina-reranker-v2-base-multilingual');
    });

    it('uses JINA_RERANK_MODEL when set', async () => {
      process.env.JINA_RERANK_MODEL = 'custom-reranker-model';
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse(
          Array.from({ length: 5 }, (_, i) => ({ index: i, relevance_score: 0.9 - i * 0.1 })),
        ),
      );

      await rerank('query', results, 5);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.model).toBe('custom-reranker-model');
    });

    it('returns a positive latencyMs for a successful call', async () => {
      const results = Array.from({ length: 6 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockImplementationOnce(async () => {
        await new Promise((r) => setTimeout(r, 5)); // small delay
        return makeJinaResponse(
          Array.from({ length: 5 }, (_, i) => ({ index: i, relevance_score: 0.9 - i * 0.1 })),
        );
      });

      const result = await rerank('query', results, 5);

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('API error responses', () => {
    it('falls back to first topK results when API returns non-OK status', async () => {
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: jest.fn().mockResolvedValue('Rate limit exceeded'),
        json: jest.fn(),
      });

      const result = await rerank('query', results, 3);

      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toBe(results[0]);
      expect(result.rerankerScores).toEqual([-1, -1, -1]);
    });

    it('includes latencyMs in error response for non-OK status', async () => {
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error'),
        json: jest.fn(),
      });

      const result = await rerank('query', results, 5);

      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('network / fetch errors', () => {
    it('falls back to first topK results when fetch throws a network error', async () => {
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await rerank('query', results, 4);

      expect(result.results).toHaveLength(4);
      expect(result.results[0]).toBe(results[0]);
      expect(result.rerankerScores).toEqual([-1, -1, -1, -1]);
    });

    it('includes latencyMs in error fallback when fetch throws', async () => {
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await rerank('query', results, 3);

      expect(typeof result.latencyMs).toBe('number');
    });

    it('handles non-Error throw values gracefully', async () => {
      const results = Array.from({ length: 8 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockRejectedValueOnce('plain string error');

      const result = await rerank('query', results, 3);

      expect(result.results).toHaveLength(3);
    });
  });

  describe('default topK parameter', () => {
    it('uses topK=5 as default', async () => {
      const results = Array.from({ length: 10 }, (_, i) => makeSearchResult(`r${i}`));
      mockFetch.mockResolvedValueOnce(
        makeJinaResponse(
          Array.from({ length: 5 }, (_, i) => ({ index: i, relevance_score: 0.9 - i * 0.1 })),
        ),
      );

      const result = await rerank('query', results); // no topK argument

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.top_n).toBe(5);
      expect(result.results).toHaveLength(5);
    });
  });
});
