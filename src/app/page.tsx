'use client';

import { useCallback, useMemo, useState } from 'react';
import { ChatWindow } from '@/components/ChatWindow';
import { MessageBubble } from '@/components/MessageBubble';
import { QAReferenceList } from '@/components/QAReferenceList';
import { SettingsPopover } from '@/components/SettingsPopover';
import type { RenderMessageParams } from '@/components/ChatWindow/types';
import { type ProviderName, normalizeProviderName } from '@/lib/providers/types';

const QA_EMPTY_STATE = {
  headline: 'What can I help with?',
  suggestions: [
    'What permissions do new hires need to apply for?',
    "Compare Project Alpha and Project Beta's tech stack",
    '公司的年假政策是什么？',
    'Kafka consumer group rebalance 怎么处理？',
  ],
};

export default function Home() {
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
      <div>
        {showQueryInfo ? (
          <div className="flex items-center gap-2 text-xs text-text-tertiary mb-2">
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

  return (
    <div className="h-screen bg-bg-primary transition-colors duration-200 relative">
      <ChatWindow
        apiUrl="/api/qa"
        placeholder="Ask a question about company docs..."
        className="h-full"
        emptyState={QA_EMPTY_STATE}
        renderMessage={renderMessage}
        requestMetadata={requestMetadata}
        headerActions={
          <SettingsPopover
            provider={provider}
            onProviderChange={setProvider}
          />
        }
      />
    </div>
  );
}
