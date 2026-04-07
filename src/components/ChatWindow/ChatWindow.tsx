'use client';

import React, { useRef, useEffect } from 'react';
import { ChatWindowProps, RenderMessageParams } from './types';
import { useChat } from '../../hooks/useChat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { MessageBubble } from '../MessageBubble';
import { ErrorMessage } from '../ErrorMessage';
import { ScrollToBottomButton } from '../ScrollToBottomButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { SendButton } from '../SendButton';

export function ChatWindow({
  apiUrl,
  placeholder = "Type your message...",
  className = "",
  emptyState,
  renderMessage,
  requestMetadata,
  headerActions,
}: ChatWindowProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    input,
    setInput,
    sendMessage,
    stopGeneration,
    isLoading,
    error,
    retry,
    retryCount
  } = useChat({
    apiUrl,
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onComplete: () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    maxRetries: 3,
    retryDelay: 1000
  });

  const { scrollRef, scrollToBottom, isAtBottom } = useAutoScroll({
    enabled: true,
    behavior: 'smooth',
    threshold: 100
  });

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const messageToSend = input.trim();
    setInput('');
    await sendMessage(messageToSend, requestMetadata);
  };

  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    console.log(`Feedback for message ${messageId}: ${feedback}`);
  };

  const defaultRenderMessage = ({ message, isStreaming, onFeedback }: RenderMessageParams) => (
    <MessageBubble
      message={message}
      onFeedback={onFeedback}
      isStreaming={isStreaming && message.role === 'assistant'}
    />
  );

  const renderMessageNode = renderMessage ?? defaultRenderMessage;

  const computedEmptyState = emptyState ?? {
    headline: 'What can I help with?',
    suggestions: [],
  };

  const hasMessages = messages.length > 0;

  return (
    <ErrorBoundary>
      <div className={`flex flex-col h-screen bg-bg-primary transition-colors duration-200 ${className}`}>
        {/* Settings - minimal top bar, no border */}
        {headerActions && (
          <div className="flex justify-end px-4 py-2 shrink-0">
            {headerActions}
          </div>
        )}

        {/* Error display */}
        <ErrorMessage
          error={error}
          onRetry={retry}
          onDismiss={() => {}}
          retryCount={retryCount}
          maxRetries={3}
        />

        {/* Main content area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
        >
          {!hasMessages ? (
            /* Empty state - title positioned above input area */
            <div className="flex flex-col items-center justify-end h-full px-4 pb-6">
              <div className="w-full max-w-3xl mx-auto text-center">
                <h1 className="text-4xl font-semibold text-text-primary mb-2">
                  {computedEmptyState.headline}
                </h1>
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((message, index) => {
                const node = renderMessageNode({
                  message,
                  index,
                  messages,
                  isStreaming: isLoading && index === messages.length - 1 && message.role === 'assistant',
                  onFeedback: handleFeedback,
                });
                return <React.Fragment key={index}>{node}</React.Fragment>;
              })}
            </div>
          )}
        </div>

        {/* Scroll to bottom */}
        <ScrollToBottomButton
          onClick={scrollToBottom}
          isVisible={!isAtBottom && messages.length > 0}
        />

        {/* Input area - Claude-style floating box */}
        <div className="w-full px-4 pb-4">
          <div className="max-w-3xl mx-auto">
            {/* Suggestion pills - only in empty state */}
            {!hasMessages && computedEmptyState.suggestions?.length ? (
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                {computedEmptyState.suggestions.map((suggestion, idx) => {
                  const match = suggestion.match(/"([^"]+)"/);
                  const questionText = match ? match[1] : suggestion;
                  const displayText = match ? match[1] : suggestion;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        if (!isLoading) {
                          void sendMessage(questionText, requestMetadata);
                        }
                      }}
                      className="px-3.5 py-2 text-sm rounded-full border border-border-default text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {displayText}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Input container */}
            <form onSubmit={handleSubmit}>
              <div className="relative flex items-end rounded-3xl border border-border-default bg-bg-secondary shadow-sm focus-within:border-border-heavy focus-within:shadow-md transition-all duration-200">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 px-5 py-3.5 bg-transparent text-text-primary placeholder-text-tertiary focus:outline-none disabled:cursor-not-allowed resize-none text-base leading-relaxed"
                  style={{ minHeight: '52px', maxHeight: '200px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isLoading) {
                        const messageToSend = input.trim();
                        setInput('');
                        void sendMessage(messageToSend, requestMetadata);
                      }
                    }
                  }}
                />
                <div className="flex items-center pr-3 pb-2.5">
                  <SendButton
                    isLoading={isLoading}
                    disabled={!input.trim()}
                    onStop={stopGeneration}
                    onClick={() => {
                      if (input.trim() && !isLoading) {
                        const messageToSend = input.trim();
                        setInput('');
                        void sendMessage(messageToSend, requestMetadata);
                      }
                    }}
                  />
                </div>
              </div>
            </form>

            {/* Footer text */}
            <p className="text-center text-xs mt-2.5 mb-1" style={{ color: 'var(--text-tertiary)' }}>
              Answers are generated from company documentation and may not always be accurate.
            </p>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
