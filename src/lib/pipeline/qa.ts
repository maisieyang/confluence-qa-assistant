import { PineconeStore, SearchResult } from '../vectorstore';
import {
  chatCompletion,
  chatCompletionStream,
  type ChatCompletionChunk,
  resolveProvider,
  type ProviderName,
} from '../providers/modelProvider';
import {
  buildProviderMessages,
  QA_USER_PROMPT_INSTRUCTIONS,
  tracePrompt,
  type PromptTraceMetadata,
} from '../prompts/unifiedPrompt';
import { transformQuery, type QueryTransformResult, type QueryIntent } from './queryTransform';
import { startTimer, writeObservation, type QAObservation } from './qaObservation';
import { rerank } from './reranker';

const DEFAULT_TEMPERATURE = 0.4;
const DEFAULT_SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? '0.65');
const TRACE_RETRIEVAL = /^(1|true|yes)$/i.test(process.env.QA_TRACE_RETRIEVAL ?? '');
const RERANK_ENABLED = !/^(0|false|no)$/i.test(process.env.RERANK_ENABLED ?? 'true');
const RETRIEVAL_TOP_K = Number(process.env.RETRIEVAL_TOP_K ?? '15');
const FALLBACK_SIMILARITY_THRESHOLD = Number(process.env.QA_FALLBACK_THRESHOLD ?? '0.50');

// Reranker score thresholds (0-1 scale, Jina Cross-Encoder)
const RERANK_SCORE_THRESHOLD = Number(process.env.RERANK_SCORE_THRESHOLD ?? '0.5');
const RERANK_FALLBACK_THRESHOLD = Number(process.env.RERANK_FALLBACK_THRESHOLD ?? '0.1');

interface AnswerReferences {
  index: number;
  title: string;
  url?: string;
}

export interface AnswerResponse {
  answer: string;
  references: AnswerReferences[];
  retrievalTrace?: RetrievalTrace;
  queryTransform?: QueryTransformResult;
}

interface RetrievalTraceEntry {
  index: number;
  id: string;
  score: number;
  title: string;
  heading?: string;
  headingPath?: string;
  spaceKey?: string;
  included: boolean;
}

export interface RetrievalTrace {
  threshold: number;
  fallbackApplied: boolean;
  fallbackThreshold?: number;
  queries: string[];
  intent: QueryIntent;
  results: RetrievalTraceEntry[];
}

function buildContext(results: SearchResult[]): { context: string; references: AnswerReferences[] } {
  const references: AnswerReferences[] = [];
  const seen = new Map<string, number>();
  const sections = results.map((result) => {
    const pageId = result.chunk.pageId ?? result.chunk.id;
    let referenceIndex = seen.get(pageId);

    if (!referenceIndex) {
      referenceIndex = references.length + 1;
      seen.set(pageId, referenceIndex);
      references.push({
        index: referenceIndex,
        title: result.chunk.title,
        url: result.chunk.sourceUrl,
      });
    }

    return [
      `Reference [${referenceIndex}] — ${result.chunk.title}`,
      result.chunk.sourceUrl ? `Source: ${result.chunk.sourceUrl}` : undefined,
      result.chunk.content,
    ]
      .filter(Boolean)
      .join('\n');
  });

  return {
    context: sections.join('\n\n---\n\n'),
    references,
  };
}

const FALLBACK_INSTRUCTIONS = `${QA_USER_PROMPT_INSTRUCTIONS}\n- No relevant documents were found. Tell the user clearly: "I could not find relevant information in the current documents." Do NOT answer from general knowledge.`;

export class QAEngine {
  constructor(
    private readonly store: PineconeStore,
    private readonly topK = 5,
    private readonly defaultProvider: ProviderName = resolveProvider(),
    private readonly similarityThreshold: number = Number.isFinite(DEFAULT_SIMILARITY_THRESHOLD)
      ? Math.min(Math.max(DEFAULT_SIMILARITY_THRESHOLD, 0), 1)
      : 0.2
  ) {}

  async answerQuestion(
    question: string,
    chatHistory?: string,
    providerOverride?: ProviderName | string,
    trace?: PromptTraceMetadata
  ): Promise<AnswerResponse> {
    const { messages, references, retrievalTrace, queryTransform } = await this.prepare(question, chatHistory, trace);
    const provider = resolveProvider(providerOverride ?? this.defaultProvider);

    const { text } = await chatCompletion({
      messages,
      temperature: DEFAULT_TEMPERATURE,
      provider,
    });

    const answer = text || 'I do not have enough information to answer that.';

    return { answer, references, retrievalTrace, queryTransform };
  }

  async createStreamingCompletion(
    question: string,
    chatHistory?: string,
    providerOverride?: ProviderName | string,
    trace?: PromptTraceMetadata
  ) {
    const { messages, references, retrievalTrace, queryTransform } = await this.prepare(question, chatHistory, trace);
    const provider = resolveProvider(providerOverride ?? this.defaultProvider);

    const { stream } = await chatCompletionStream({
      messages,
      temperature: DEFAULT_TEMPERATURE,
      provider,
    });

    return {
      references,
      stream,
      retrievalTrace,
      queryTransform,
    } as {
      references: AnswerReferences[];
      stream: AsyncIterable<ChatCompletionChunk>;
      retrievalTrace: RetrievalTrace;
      queryTransform: QueryTransformResult;
    };
  }

  /**
   * Multi-query retrieval: run each rewritten query against the store,
   * then merge and deduplicate results by chunk id, keeping the highest score.
   */
  private async multiQuerySearch(queries: string[]): Promise<SearchResult[]> {
    const allResults = await Promise.all(
      queries.map((query) => this.store.search(query, this.topK))
    );

    const bestByChunkId = new Map<string, SearchResult>();
    for (const results of allResults) {
      for (const result of results) {
        const existing = bestByChunkId.get(result.chunk.id);
        if (!existing || result.score > existing.score) {
          bestByChunkId.set(result.chunk.id, result);
        }
      }
    }

    return Array.from(bestByChunkId.values()).sort((a, b) => b.score - a.score);
  }

  private async prepare(question: string, chatHistory?: string, trace?: PromptTraceMetadata) {
    if (!question.trim()) {
      throw new Error('Question must not be empty');
    }

    const totalTimer = startTimer();

    // Step 1: Query Transform — intent classification + rewriting + decomposition
    const transformTimer = startTimer();
    const queryTransform = await transformQuery(question, chatHistory);
    const transformLatency = transformTimer();

    // Step 2: If intent is general (greeting, off-topic), skip retrieval entirely
    if (queryTransform.intent === 'general') {
      const { messages, userPrompt } = buildProviderMessages({
        question,
        chatHistory,
        instructions: `- This is a general conversation (greeting, thanks, or off-topic). Respond naturally and briefly without citing any references.`,
        contextSections: [],
      });

      tracePrompt(
        { label: trace?.label ?? 'qa.prompt.general', requestId: trace?.requestId },
        messages,
      );

      const retrievalTrace: RetrievalTrace = {
        threshold: this.similarityThreshold,
        fallbackApplied: false,
        queries: [],
        intent: 'general',
        results: [],
      };

      // Fire-and-forget observation logging
      const observation: QAObservation = {
        requestId: trace?.requestId ?? 'unknown',
        timestamp: new Date().toISOString(),
        queryTransform: {
          originalQuestion: question,
          intent: 'general',
          rewrittenQueries: [],
          latencyMs: transformLatency,
        },
        retrieval: null,
        generation: {
          model: this.defaultProvider,
          provider: this.defaultProvider,
          promptCharCount: userPrompt.length,
          referenceCount: 0,
          scenario: 'general',
        },
        totalLatencyMs: totalTimer(),
      };
      writeObservation(observation);

      return { messages, references: [], retrievalTrace, queryTransform };
    }

    // Step 3: Retrieve using transformed queries — cast a wide net
    const retrievalTimer = startTimer();
    const searchQueries = queryTransform.queries;
    const wideTopK = RERANK_ENABLED ? RETRIEVAL_TOP_K : this.topK;
    const rawResults = searchQueries.length === 1
      ? await this.store.search(searchQueries[0], wideTopK)
      : await this.multiQuerySearch(searchQueries);
    const retrievalLatency = retrievalTimer();

    // Step 4: Rerank — use LLM to re-score results by semantic relevance
    let rerankLatency = 0;
    let rerankerScores: number[] = [];
    let rerankedResults = rawResults;
    if (RERANK_ENABLED && rawResults.length > this.topK) {
      const rerankResult = await rerank(question, rawResults, this.topK);
      rerankedResults = rerankResult.results;
      rerankerScores = rerankResult.rerankerScores;
      rerankLatency = rerankResult.latencyMs;
    }

    // Step 5: Filter by relevance — use reranker scores when available, else vector scores
    let relevantResults: SearchResult[];
    let fallbackApplied = false;
    const hasRerankerScores = rerankerScores.length > 0 && rerankerScores.some((s) => s >= 0);

    if (hasRerankerScores) {
      // Reranker-driven filtering (0-10 scale)
      const paired = rerankedResults.map((r, i) => ({ result: r, rerankScore: rerankerScores[i] ?? 0 }));

      const highConfidence = paired.filter((p) => p.rerankScore >= RERANK_SCORE_THRESHOLD);
      if (highConfidence.length > 0) {
        relevantResults = highConfidence.map((p) => p.result);
      } else {
        const mediumConfidence = paired.filter((p) => p.rerankScore >= RERANK_FALLBACK_THRESHOLD);
        if (mediumConfidence.length > 0) {
          relevantResults = mediumConfidence.map((p) => p.result);
          fallbackApplied = true;
        } else if (paired.length > 0 && paired[0].rerankScore > 0) {
          relevantResults = [paired[0].result];
          fallbackApplied = true;
        } else {
          relevantResults = [];
        }
      }
    } else {
      // Fallback to vector score filtering (cosine similarity, 0-1 scale)
      relevantResults = rerankedResults.filter((result) => result.score >= this.similarityThreshold);

      if (relevantResults.length === 0 && rerankedResults.length > 0) {
        const fallbackResults = rerankedResults.filter((result) => result.score >= FALLBACK_SIMILARITY_THRESHOLD);
        if (fallbackResults.length > 0) {
          relevantResults = fallbackResults;
          fallbackApplied = true;
        } else {
          relevantResults = [rerankedResults[0]];
          fallbackApplied = true;
        }
      }
    }

    // Cap results to topK
    if (relevantResults.length > this.topK) {
      relevantResults = relevantResults.slice(0, this.topK);
    }

    const includedIds = new Set(relevantResults.map((result) => result.chunk.id));
    const retrievalTrace: RetrievalTrace = {
      threshold: this.similarityThreshold,
      fallbackApplied,
      fallbackThreshold: fallbackApplied
        ? (hasRerankerScores ? RERANK_FALLBACK_THRESHOLD : FALLBACK_SIMILARITY_THRESHOLD)
        : undefined,
      queries: searchQueries,
      intent: 'knowledge_qa',
      results: rawResults.map((result, idx) => ({
        index: idx + 1,
        id: result.chunk.id,
        score: Number(result.score.toFixed(4)),
        title: result.chunk.title,
        heading: result.chunk.heading,
        headingPath: result.chunk.headingPath,
        spaceKey: result.chunk.spaceKey,
        included: includedIds.has(result.chunk.id),
      })),
    };

    if (TRACE_RETRIEVAL) {
      console.debug(JSON.stringify({ type: 'qa_retrieval', trace: retrievalTrace }));
    }

    // Compute retrieval stats for observation
    const scores = rawResults.map((r) => r.score);
    const retrievalObs = {
      queries: searchQueries,
      rawResultCount: rawResults.length,
      includedResultCount: relevantResults.length,
      topScore: scores.length > 0 ? Number(Math.max(...scores).toFixed(4)) : null,
      avgScore: scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4)) : null,
      fallbackApplied,
      latencyMs: retrievalLatency + rerankLatency,
    };

    let scenario: 'normal' | 'low_confidence' | 'no_context';

    if (relevantResults.length === 0) {
      scenario = 'no_context';
      const { messages, userPrompt } = buildProviderMessages({
        question,
        chatHistory,
        instructions: FALLBACK_INSTRUCTIONS,
        contextSections: [
          {
            title: 'Retrieval Context',
            content: 'No relevant Confluence context was retrieved above the similarity threshold.',
          },
        ],
      });

      tracePrompt(
        { label: trace?.label ?? 'qa.prompt.fallback', requestId: trace?.requestId },
        messages
      );

      const observation: QAObservation = {
        requestId: trace?.requestId ?? 'unknown',
        timestamp: new Date().toISOString(),
        queryTransform: {
          originalQuestion: question,
          intent: 'knowledge_qa',
          rewrittenQueries: searchQueries,
          latencyMs: transformLatency,
        },
        retrieval: retrievalObs,
        generation: {
          model: this.defaultProvider,
          provider: this.defaultProvider,
          promptCharCount: userPrompt.length,
          referenceCount: 0,
          scenario,
        },
        totalLatencyMs: totalTimer(),
      };
      writeObservation(observation);

      return { messages, references: [], retrievalTrace, queryTransform };
    }

    scenario = fallbackApplied ? 'low_confidence' : 'normal';

    const { context, references } = buildContext(relevantResults);
    const instructions = fallbackApplied
      ? `${QA_USER_PROMPT_INSTRUCTIONS}\n- The retrieved context has low confidence. Use it cautiously, and warn the user: "The following information may not be directly relevant — please verify."`
      : QA_USER_PROMPT_INSTRUCTIONS;

    const { messages, userPrompt } = buildProviderMessages({
      question,
      chatHistory,
      instructions,
      contextSections: [
        { title: 'Retrieval Context', content: context },
      ],
    });

    tracePrompt(
      {
        label: trace?.label ?? (fallbackApplied ? 'qa.prompt.fallback-context' : 'qa.prompt'),
        requestId: trace?.requestId,
      },
      messages
    );

    // Fire-and-forget observation logging
    const observation: QAObservation = {
      requestId: trace?.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
      queryTransform: {
        originalQuestion: question,
        intent: 'knowledge_qa',
        rewrittenQueries: searchQueries,
        latencyMs: transformLatency,
      },
      retrieval: retrievalObs,
      generation: {
        model: this.defaultProvider,
        provider: this.defaultProvider,
        promptCharCount: userPrompt.length,
        referenceCount: references.length,
        scenario,
      },
      totalLatencyMs: totalTimer(),
    };
    writeObservation(observation);

    return { messages, references, retrievalTrace, queryTransform };
  }
}
