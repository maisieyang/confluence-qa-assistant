import { chatCompletion, type ProviderName } from '../providers/modelProvider';

const EVAL_MODEL = process.env.EVAL_MODEL ?? 'qwen-turbo';
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

const EVAL_SYSTEM_PROMPT = `You are a strict evaluator for a RAG (Retrieval-Augmented Generation) system.
You will be given a question, retrieved context, and the system's answer.
Score each dimension from 0.0 to 1.0 with one decimal place.

Return ONLY valid JSON, no markdown fences, no explanation outside the JSON:
{
  "faithfulness": { "score": 0.0, "reason": "..." },
  "relevancy": { "score": 0.0, "reason": "..." },
  "contextPrecision": { "score": 0.0, "reason": "..." }
}

## Scoring Criteria

### Faithfulness (0.0 - 1.0)
Is every claim in the answer supported by the retrieved context?
- 1.0: Every factual statement is traceable to the context. No fabrication.
- 0.7: Mostly faithful, but includes minor unsupported elaboration.
- 0.3: Contains significant claims not found in context.
- 0.0: Answer is entirely fabricated or contradicts the context.

### Relevancy (0.0 - 1.0)
Does the answer actually address the user's question?
- 1.0: Directly and completely answers the question.
- 0.7: Partially answers, missing some aspects.
- 0.3: Tangentially related but doesn't really answer.
- 0.0: Completely off-topic.
- Special: If the system correctly says "I could not find relevant information" for a question that IS outside the knowledge base, score 1.0 (this is the correct behavior).

### Context Precision (0.0 - 1.0)
Are the retrieved context chunks actually relevant to the question?
- 1.0: All retrieved chunks are highly relevant.
- 0.7: Most chunks are relevant, some noise.
- 0.3: Only a few chunks are relevant, most are noise.
- 0.0: None of the retrieved chunks are relevant.
- If no context was retrieved (general intent), score N/A as 1.0.`;

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
