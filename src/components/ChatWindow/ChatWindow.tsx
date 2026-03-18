'use client';

import React, { useRef, useEffect } from 'react';
import { ChatWindowProps, RenderMessageParams } from './types';
import { useChat } from '../../hooks/useChat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { MessageBubble } from '../MessageBubble';
import { ErrorMessage } from '../ErrorMessage';
import { ScrollToBottomButton } from '../ScrollToBottomButton';
import { ErrorBoundary } from '../ErrorBoundary';
import { ThemeSelector } from '../ThemeSelector';
import { SendButton } from '../SendButton';

export function ChatWindow({
  apiUrl,
  placeholder = "Type your message...",
  className = "",
  title = 'AI Chat Assistant',
  emptyState,
  renderMessage,
  requestMetadata,
  toolbarActions,
}: ChatWindowProps) {
  // 输入框引用
  const inputRef = useRef<HTMLTextAreaElement>(null);

      // 使用自定义 useChat Hook
      const {
        messages,
        input,
        setInput,
        sendMessage,
        isLoading,
        error,
        retry,
        retryCount
      } = useChat({
    apiUrl,
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onSuccess: (message) => {
      console.log('Message sent successfully:', message);
    },
    onComplete: () => {
      // 消息发送完成后，重新聚焦到输入框
      if (inputRef.current) {
        inputRef.current.focus();
      }
    },
    maxRetries: 3,
    retryDelay: 1000
  });

  // 使用自动滚动 Hook
  const { scrollRef, scrollToBottom, isAtBottom } = useAutoScroll({
    enabled: true,
    behavior: 'smooth',
    threshold: 100
  });

  // 页面加载时自动聚焦到输入框
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // 表单提交处理函数
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageToSend = input.trim();
    setInput(''); // 立即清除输入框
    await sendMessage(messageToSend, requestMetadata);
  };

  // 反馈处理函数
  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    console.log(`Feedback for message ${messageId}: ${feedback}`);
    // 这里可以添加反馈收集逻辑
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
    icon: '🤖',
    headline: 'AI Chat Assistant',
    description: '开始对话，获得智能回答',
    suggestions: [
      '💡 尝试问：“解释React Hooks的工作原理”',
      '💡 尝试问：“写一个Python函数来计算斐波那契数列”',
    ],
  };

  return (
    <ErrorBoundary>
      <div className={`flex flex-col h-screen bg-bg-primary transition-colors duration-200 ${className}`}>
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between p-4 bg-bg-primary">
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-semibold text-text-primary">
                  {title}
                </h1>
              </div>
              <div className="flex items-center space-x-3">
                {toolbarActions ? (
                  <div className="flex items-center space-x-2 text-sm text-text-secondary">
                    {toolbarActions}
                  </div>
                ) : null}
                <ThemeSelector />
              </div>
            </div>

        {/* 错误信息显示 */}
        <ErrorMessage
          error={error}
          onRetry={retry}
          onDismiss={() => {}} // 可以添加清除错误的功能
          retryCount={retryCount}
          maxRetries={3}
        />

        {/* 聊天对话展示区域 - 全屏阅读体验 */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 bg-bg-primary"
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-tertiary">
              <div className="text-center">
                {computedEmptyState.icon && (
                  <div className="text-6xl mb-4">{computedEmptyState.icon}</div>
                )}
                <h2 className="text-3xl font-semibold mb-2 text-text-primary">
                  {computedEmptyState.headline}
                </h2>
                {computedEmptyState.description && (
                  <p className="text-xl mb-6 text-text-secondary">
                    {computedEmptyState.description}
                  </p>
                )}
                {computedEmptyState.suggestions?.length ? (
                  <div className="space-y-3 text-base max-w-lg mx-auto">
                    {computedEmptyState.suggestions.map((suggestion, idx) => {
                      // Extract the question text between quotes for sending
                      const match = suggestion.match(/"([^"]+)"/);
                      const questionText = match ? match[1] : suggestion.replace(/^💡\s*/, '');

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
                          className="w-full text-left px-4 py-3 rounded-xl border border-border-default bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary hover:border-accent transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {suggestion}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4">
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

        {/* 滚动到底部按钮 */}
        <ScrollToBottomButton
          onClick={scrollToBottom}
          isVisible={!isAtBottom && messages.length > 0}
        />

        {/* 输入表单区域 - 全屏宽度 */}
        <div className="bg-bg-primary">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4">
            <div className="flex items-end space-x-3">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholder}
                  disabled={isLoading}
                  rows={1}
                  className="w-full px-4 py-3 rounded-2xl bg-bg-tertiary text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-bg-secondary disabled:cursor-not-allowed resize-none text-base leading-relaxed border-0 shadow-sm"
                  style={{ minHeight: '48px', maxHeight: '120px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !isLoading) {
                        const messageToSend = input.trim();
                        setInput(''); // 立即清除输入框
                        void sendMessage(messageToSend, requestMetadata);
                      }
                    }
                  }}
                />
              </div>
              <SendButton
                isLoading={isLoading}
                disabled={!input.trim()}
                onClick={() => {
                  if (input.trim() && !isLoading) {
                    const messageToSend = input.trim();
                    setInput('');
                    void sendMessage(messageToSend, requestMetadata);
                  }
                }}
              />
            </div>
          </form>
        </div>
      </div>
    </ErrorBoundary>
  );
}
