import { chatCompletion, type ProviderName } from '../providers/modelProvider';

const EVAL_MODEL = process.env.EVAL_MODEL ?? 'qwen-max';
const EVAL_PROVIDER: ProviderName = 'qwen';

export interface EvalScores {
  faithfulness: number;
  relevancy: number;
  contextPrecision: number;
}

export interface EvalResult {
  id: string;
  question: string;
  answer: string;
  intent: string;
  rewrittenQueries: string[];
  referenceCount: number;
  scenario: string;
  topScore: number | null;
  scores: EvalScores | null;
  reasoning: {
    faithfulness: string;
    relevancy: string;
    contextPrecision: string;
  } | null;
  latencyMs: number;
}

const EVAL_SYSTEM_PROMPT = `You are an evaluator for a RAG (Retrieval-Augmented Generation) system.
You will be given a question, the retrieved context chunks (the actual document content the system had access to), and the system's answer.

Score each dimension from 0.0 to 1.0 with one decimal place.

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{
  "faithfulness": { "score": 0.0, "reason": "..." },
  "relevancy": { "score": 0.0, "reason": "..." },
  "contextPrecision": { "score": 0.0, "reason": "..." }
}

## Scoring Criteria

### Faithfulness (0.0 - 1.0)
Can each factual claim in the answer be verified from the retrieved context?

IMPORTANT: Faithfulness is about factual accuracy, NOT about exact wording. Paraphrasing, summarizing, and reorganizing information from the context is perfectly fine and should score HIGH. Only penalize when the answer contains specific facts (numbers, names, steps, dates) that CANNOT be found anywhere in the context.

- 1.0: All facts in the answer can be found in or reasonably inferred from the context. Paraphrasing is fine.
- 0.7: Most facts are supported, with minor additions that are reasonable inferences.
- 0.3: Contains significant specific claims (numbers, names, steps) not found in context.
- 0.0: Answer is entirely fabricated or contradicts the context.

Example: If context says "Minimum 12 characters" and answer says "at least 12 characters long", this is faithful (score 1.0), not fabrication.

### Relevancy (0.0 - 1.0)
Does the answer actually address the user's question?
- 1.0: Directly and completely answers the question.
- 0.7: Partially answers, missing some aspects.
- 0.3: Tangentially related but doesn't really answer.
- 0.0: Completely off-topic.
- Special: If the system correctly says "I could not find relevant information" for a question outside the knowledge base, score 1.0.

### Context Precision (0.0 - 1.0)
Is the TOP-RANKED retrieved chunk actually relevant to answering the question?
- 1.0: The first chunk directly contains information needed to answer the question.
- 0.7: The first chunk is relevant but not the best possible match.
- 0.3: The first chunk is only tangentially related.
- 0.0: The first chunk is completely irrelevant to the question.`;

function buildEvalUserPrompt(
  question: string,
  context: string,
  answer: string,
): string {
  return `## Question
${question}

## Retrieved Context
${context || '(No context retrieved — this was classified as a general/off-topic question)'}

## System Answer
${answer}`;
}

export async function evaluateAnswer(
  question: string,
  context: string,
  answer: string,
): Promise<{ scores: EvalScores; reasoning: { faithfulness: string; relevancy: string; contextPrecision: string } }> {
  const { text } = await chatCompletion({
    messages: [
      { role: 'system', content: EVAL_SYSTEM_PROMPT },
      { role: 'user', content: buildEvalUserPrompt(question, context, answer) },
    ],
    temperature: 0,
    model: EVAL_MODEL,
    provider: EVAL_PROVIDER,
  });

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      scores: {
        faithfulness: Number(parsed.faithfulness?.score ?? 0),
        relevancy: Number(parsed.relevancy?.score ?? 0),
        contextPrecision: Number(parsed.contextPrecision?.score ?? 0),
      },
      reasoning: {
        faithfulness: String(parsed.faithfulness?.reason ?? ''),
        relevancy: String(parsed.relevancy?.reason ?? ''),
        contextPrecision: String(parsed.contextPrecision?.reason ?? ''),
      },
    };
  } catch {
    console.warn('Failed to parse eval response:', cleaned);
    return {
      scores: { faithfulness: 0, relevancy: 0, contextPrecision: 0 },
      reasoning: { faithfulness: 'Parse error', relevancy: 'Parse error', contextPrecision: 'Parse error' },
    };
  }
}
