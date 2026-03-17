import { chatCompletion, type ProviderName } from '../providers/modelProvider';

const QUERY_TRANSFORM_MODEL = process.env.QUERY_TRANSFORM_MODEL ?? 'qwen-turbo';
const QUERY_TRANSFORM_PROVIDER: ProviderName = 'qwen';

const TRACE_QUERY_TRANSFORM = /^(1|true|yes)$/i.test(process.env.QA_TRACE_QUERY_TRANSFORM ?? process.env.QA_TRACE_RETRIEVAL ?? '');

export type QueryIntent = 'knowledge_qa' | 'general';

export interface QueryTransformResult {
  intent: QueryIntent;
  queries: string[];
  originalQuestion: string;
}

const QUERY_TRANSFORM_SYSTEM_PROMPT = `You are a query optimizer for an enterprise knowledge base (Confluence wiki).

Your job: take the user's raw question (possibly with conversation history) and produce optimized search queries.

Rules:
1. **Resolve references**: Use conversation history to replace pronouns ("it", "that", "the one mentioned before") and fill in omitted context with concrete terms.
2. **Rewrite for search**: Convert colloquial or vague phrasing into precise, search-friendly language. Keep domain-specific terms, project names, and technical jargon intact.
3. **Decompose if needed**: If the question is compound (asks about multiple distinct topics, or requires comparing two things), split into 2-3 independent search queries. If it is a simple question, return exactly one query.
4. **Intent classification**: Determine if the question requires searching the knowledge base ("knowledge_qa") or is a greeting, thank-you, general chat, or off-topic request ("general").

Return **only** valid JSON, no markdown fences, no explanation:
{"intent":"knowledge_qa","queries":["optimized query 1","optimized query 2"]}

Examples:

User question: "你好"
Output: {"intent":"general","queries":[]}

User question: "怎么申请VPN权限"
Output: {"intent":"knowledge_qa","queries":["VPN 权限申请流程"]}

User question: "那个问题解决了吗" (history mentions Kafka rebalance)
Output: {"intent":"knowledge_qa","queries":["Kafka 消费者组 rebalance 问题解决方案"]}

User question: "A项目和B项目的技术栈有什么区别"
Output: {"intent":"knowledge_qa","queries":["A项目 技术栈 架构","B项目 技术栈 架构"]}

User question: "帮我写一首诗"
Output: {"intent":"general","queries":[]}`;

function buildTransformUserPrompt(question: string, chatHistory?: string): string {
  const parts: string[] = [];

  if (chatHistory?.trim()) {
    parts.push(`Conversation history:\n${chatHistory.trim()}`);
  }

  parts.push(`User question: ${question}`);

  return parts.join('\n\n');
}

function parseTransformResponse(raw: string): { intent: QueryIntent; queries: string[] } {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const intent: QueryIntent =
      parsed.intent === 'general' ? 'general' : 'knowledge_qa';
    const queries: string[] = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q: unknown) => typeof q === 'string' && q.trim()).map((q: string) => q.trim())
      : [];

    return { intent, queries };
  } catch {
    return { intent: 'knowledge_qa', queries: [] };
  }
}

export async function transformQuery(
  question: string,
  chatHistory?: string,
): Promise<QueryTransformResult> {
  const userPrompt = buildTransformUserPrompt(question, chatHistory);

  try {
    const { text } = await chatCompletion({
      messages: [
        { role: 'system', content: QUERY_TRANSFORM_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      model: QUERY_TRANSFORM_MODEL,
      provider: QUERY_TRANSFORM_PROVIDER,
    });

    const { intent, queries } = parseTransformResponse(text);

    if (TRACE_QUERY_TRANSFORM) {
      console.debug(JSON.stringify({
        type: 'query_transform',
        originalQuestion: question,
        intent,
        queries,
        rawResponse: text,
      }));
    }

    // If LLM returned no queries for a knowledge_qa intent, fall back to original question
    if (intent === 'knowledge_qa' && queries.length === 0) {
      return { intent, queries: [question], originalQuestion: question };
    }

    return { intent, queries, originalQuestion: question };
  } catch (error) {
    console.warn(
      'Query transform failed, falling back to original question:',
      error instanceof Error ? error.message : String(error),
    );
    return { intent: 'knowledge_qa', queries: [question], originalQuestion: question };
  }
}
