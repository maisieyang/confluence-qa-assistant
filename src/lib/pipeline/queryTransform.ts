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
3. **CRITICAL — Language matching**: The queries MUST be in the SAME language as the user's question. English question → English queries. Chinese question → Chinese queries. NEVER translate. This is the most important rule.
4. **Decompose if needed**: If the question is compound (asks about multiple distinct topics, or requires comparing two things), split into 2-3 independent search queries. If it is a simple question, return exactly one query.
5. **Intent classification**: Determine if the question requires searching the knowledge base ("knowledge_qa") or is a greeting, thank-you, general chat, or off-topic request ("general").

Return **only** valid JSON, no markdown fences, no explanation:
{"intent":"knowledge_qa","queries":["optimized query 1","optimized query 2"]}

Examples:

User question (English): "How do I set up VPN?"
Output: {"intent":"knowledge_qa","queries":["VPN setup guide steps"]}

User question (English): "What permissions do new hires need?"
Output: {"intent":"knowledge_qa","queries":["new hire onboarding permissions access"]}

User question (English): "Compare project A and project B's tech stack"
Output: {"intent":"knowledge_qa","queries":["Project A tech stack architecture","Project B tech stack architecture"]}

User question (Chinese): "怎么申请VPN权限"
Output: {"intent":"knowledge_qa","queries":["VPN 权限申请流程"]}

User question (Chinese): "A项目和B项目的技术栈有什么区别"
Output: {"intent":"knowledge_qa","queries":["A项目 技术栈 架构","B项目 技术栈 架构"]}

User question: "你好"
Output: {"intent":"general","queries":[]}

User question: "帮我写一首诗"
Output: {"intent":"general","queries":[]}`;

function detectLanguage(text: string): 'English' | 'Chinese' {
  const chineseChars = text.match(/[\u4e00-\u9fff]/g);
  const ratio = chineseChars ? chineseChars.length / text.length : 0;
  return ratio > 0.1 ? 'Chinese' : 'English';
}

function buildTransformUserPrompt(question: string, chatHistory?: string): string {
  const parts: string[] = [];

  if (chatHistory?.trim()) {
    parts.push(`Conversation history:\n${chatHistory.trim()}`);
  }

  const lang = detectLanguage(question);
  parts.push(`User question (${lang}): ${question}`);
  parts.push(`REMINDER: Output queries MUST be in ${lang}. Do NOT translate.`);

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
