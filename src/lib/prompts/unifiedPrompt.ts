import type { ProviderChatMessage } from '../providers/modelProvider';
import { UNIFIED_SYSTEM_PROMPT } from './systemPrompts';

const TRACE_FLAG = /^(1|true|yes)$/i.test(
  process.env.PROMPT_TRACE ??
    process.env.PROMPT_DEBUG ??
    process.env.LOG_PROMPTS ??
    ''
);

const MAX_TRACE_PREVIEW = Number.parseInt(process.env.PROMPT_TRACE_PREVIEW_LENGTH ?? '2000', 10);

export interface PromptSection {
  title: string;
  content: string | null | undefined;
}

export interface BuildUnifiedUserPromptOptions {
  question: string;
  chatHistory?: string | null;
  instructions?: string | null;
  contextSections?: PromptSection[];
}

export function buildUnifiedUserPrompt(options: BuildUnifiedUserPromptOptions): string {
  const { question, chatHistory, instructions, contextSections = [] } = options;

  const sections: string[] = [];
  const pushSection = (label: string, value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    sections.push(`## ${label}\n${trimmed}`);
  };

  if (instructions?.trim()) {
    sections.push(instructions.trim());
  }

  pushSection('Conversation History', chatHistory ?? undefined);

  contextSections
    .map((section) => ({
      title: section.title.trim() || 'Context',
      content: section.content?.trim(),
    }))
    .filter((section) => !!section.content)
    .forEach((section) => {
      pushSection(section.title, section.content ?? undefined);
    });

  pushSection('User Question', question);

  return sections.join('\n\n---\n\n');
}

export interface BuildProviderMessagesOptions extends BuildUnifiedUserPromptOptions {
  systemPrompt?: string;
}

export function buildProviderMessages(
  options: BuildProviderMessagesOptions
): { messages: ProviderChatMessage[]; userPrompt: string } {
  const userPrompt = buildUnifiedUserPrompt(options);
  const systemPrompt = (options.systemPrompt ?? UNIFIED_SYSTEM_PROMPT).trim();

  const messages: ProviderChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  return { messages, userPrompt };
}

function truncateContent(value: string): string {
  if (!Number.isFinite(MAX_TRACE_PREVIEW) || MAX_TRACE_PREVIEW <= 0) {
    return value;
  }
  return value.length > MAX_TRACE_PREVIEW
    ? `${value.slice(0, MAX_TRACE_PREVIEW)}…`
    : value;
}

export interface PromptTraceMetadata {
  label: string;
  requestId?: string;
}

export function tracePrompt(
  metadata: PromptTraceMetadata,
  messages: ProviderChatMessage[]
) {
  if (!TRACE_FLAG) {
    return;
  }

  const payload = {
    type: 'prompt_trace',
    label: metadata.label,
    requestId: metadata.requestId,
    timestamp: new Date().toISOString(),
    messages: messages.map((message, index) => ({
      index,
      role: message.role,
      length: message.content.length,
      preview: truncateContent(message.content),
    })),
  };

  console.debug(JSON.stringify(payload));
}

export const QA_USER_PROMPT_INSTRUCTIONS = `### Task Instructions
- Answer strictly based on the retrieval context below. Cite every factual claim with [n].
- If the context is insufficient, tell the user what is missing rather than guessing.
- Do NOT add a References section — cite inline only.`;
