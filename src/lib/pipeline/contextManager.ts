import { chatCompletion, type ProviderName } from '../providers/modelProvider';

const SUMMARY_MODEL = process.env.CONTEXT_SUMMARY_MODEL ?? 'qwen-turbo';
const SUMMARY_PROVIDER: ProviderName = 'qwen';
const MAX_RECENT_ROUNDS = Number(process.env.CONTEXT_MAX_RECENT_ROUNDS ?? '3');

interface HistoryMessage {
  role: string;
  content: string;
}

const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Compress the conversation history into a brief summary that preserves:
1. Key topics discussed
2. Important entities mentioned (project names, tool names, people, specific terms)
3. Any conclusions or decisions reached
4. Open questions that were asked but not fully resolved

Keep the summary under 200 words. Write in the same language as the conversation.
Output ONLY the summary, no preamble.`;

/**
 * Summarize early conversation messages using LLM.
 */
async function summarizeMessages(messages: HistoryMessage[]): Promise<string> {
  const conversation = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  try {
    const { text } = await chatCompletion({
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: conversation },
      ],
      temperature: 0,
      model: SUMMARY_MODEL,
      provider: SUMMARY_PROVIDER,
    });

    return text.trim();
  } catch (error) {
    console.warn(
      'Context summary failed, falling back to truncation:',
      error instanceof Error ? error.message : String(error),
    );
    // Fallback: just take the last few messages from the early part
    return messages
      .slice(-4)
      .map((m) => `${m.role}: ${m.content.substring(0, 100)}`)
      .join('\n');
  }
}

/**
 * Build a managed chat history string from message array.
 *
 * - If history is short (<= MAX_RECENT_ROUNDS * 2 messages), keep all.
 * - If history is long, summarize early messages and append recent ones.
 *
 * Returns the formatted chat history string ready for the QA pipeline.
 */
export async function buildManagedChatHistory(
  allMessages: HistoryMessage[],
): Promise<string> {
  if (allMessages.length === 0) {
    return '';
  }

  const maxRecentMessages = MAX_RECENT_ROUNDS * 2; // Each round = 1 user + 1 assistant

  // Short conversation — keep everything
  if (allMessages.length <= maxRecentMessages) {
    return allMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
  }

  // Long conversation — summarize early + keep recent
  const earlyMessages = allMessages.slice(0, -maxRecentMessages);
  const recentMessages = allMessages.slice(-maxRecentMessages);

  const summary = await summarizeMessages(earlyMessages);

  const recentFormatted = recentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  return `[Summary of earlier conversation]\n${summary}\n\n[Recent messages]\n${recentFormatted}`;
}
