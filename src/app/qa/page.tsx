'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChatWindow } from '@/components/ChatWindow';
import { MessageBubble } from '@/components/MessageBubble';
import { QAReferenceList } from '@/components/QAReferenceList';
import type { RenderMessageParams } from '@/components/ChatWindow/types';
import { PROVIDER_OPTIONS, type ProviderName, normalizeProviderName } from '@/lib/providers/types';

const QA_EMPTY_STATE = {
  icon: '📚',
  headline: 'Confluence Knowledge Assistant',
  description: 'Your intelligent assistant for internal documentation. Ask questions in English or Chinese.',
  suggestions: [
    '💡 “What permissions do new hires need to apply for?”',
    '💡 “How do I deploy a service to production?”',
    '💡 “新人入职需要做哪些准备？”',
    '💡 “Kafka consumer group rebalance 怎么处理？”',
  ],
};

export default function QAPage() {
  const [provider, setProvider] = useState<ProviderName>(
    normalizeProviderName(process.env.NEXT_PUBLIC_PROVIDER as ProviderName | undefined)
  );

  const requestMetadata = useMemo(() => ({ provider }), [provider]);

  const renderMessage = useCallback(({ message, isStreaming, onFeedback }: RenderMessageParams) => {
    const queryTransform = message.metadata?.queryTransform as
      | { intent?: string; queries?: string[] }
      | undefined;

    const showQueryInfo =
      message.role === 'assistant' &&
      queryTransform?.intent === 'knowledge_qa' &&
      queryTransform?.queries?.length;

    return (
      <div className="space-y-3">
        {showQueryInfo ? (
          <div className="ml-10 flex items-center gap-2 text-xs text-text-tertiary">
            <span className="shrink-0">🔍</span>
            <span>
              Searched: {queryTransform!.queries!.map((q, i) => (
                <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-bg-tertiary text-text-secondary">
                  {q}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        <MessageBubble
          message={message}
          onFeedback={onFeedback}
          isStreaming={isStreaming && message.role === 'assistant'}
        />
        {message.role === 'assistant' && message.references?.length ? (
          <QAReferenceList references={message.references} />
        ) : null}
      </div>
    );
  }, []);

  const toolbarActions = (
    <div className="flex items-center space-x-2">
      <label htmlFor="qa-provider" className="text-sm text-text-tertiary">
        Model
      </label>
      <select
        id="qa-provider"
        value={provider}
        onChange={(event) => setProvider(event.target.value as ProviderName)}
        className="rounded-md border border-border-subtle bg-bg-secondary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
      >
        {PROVIDER_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'openai' ? 'OpenAI' : 'Qwen (通义千问)'}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="h-screen bg-bg-primary transition-colors duration-200">
      <ChatWindow
        apiUrl="/api/qa"
        placeholder="Ask a question about company docs..."
        className="h-full"
        title="Confluence Knowledge Assistant"
        emptyState={QA_EMPTY_STATE}
        renderMessage={renderMessage}
        requestMetadata={requestMetadata}
        toolbarActions={toolbarActions}
      />
    </div>
  );
}
