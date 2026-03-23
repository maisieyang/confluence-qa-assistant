'use client';

import React from 'react';
import { ChatMessage } from './ChatWindow/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageFeedback } from './MessageFeedback';

interface MessageBubbleProps {
  message: ChatMessage;
  className?: string;
  onFeedback?: (messageId: string, feedback: 'like' | 'dislike') => void;
  isStreaming?: boolean;
}

export function MessageBubble({ message, className = '', onFeedback, isStreaming = false }: MessageBubbleProps) {
  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return '';
    return timestamp.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`w-full ${className}`}>
      {message.role === 'user' ? (
        // 用户消息 - ChatGPT风格布局
        <div className="flex justify-end mb-6">
          <div className="max-w-[85%] lg:max-w-[70%]">
            <div className="bg-bg-tertiary text-text-primary px-4 py-3 rounded-2xl rounded-br-md shadow-sm">
              <div className="text-base whitespace-pre-wrap leading-relaxed">
                {message.content}
              </div>
            </div>
            {message.timestamp && (
              <div className="text-xs text-text-tertiary mt-1 text-right opacity-70">
                {formatTime(message.timestamp)}
              </div>
            )}
          </div>
        </div>
      ) : (
        // AI消息 - ChatGPT风格布局
        <div className="flex justify-start mb-6">
          <div className="max-w-[85%] lg:max-w-[70%]">
            {/* AI头像 */}
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-8 h-8 bg-bg-tertiary rounded-full flex items-center justify-center">
                <span className="text-sm">🤖</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="prose prose-lg max-w-none text-base leading-relaxed">
                  <MarkdownRenderer content={message.content} />
                  {isStreaming && (
                    <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse" 
                          style={{ animationDuration: '1s' }}></span>
                  )}
                </div>
                
                {/* 消息操作栏 - 仅在流式结束后显示 */}
                {!isStreaming && (
                  <div className="flex items-center justify-between mt-3 opacity-60 hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center space-x-2">
                      {message.timestamp && (
                        <span className="text-xs text-text-tertiary">
                          {formatTime(message.timestamp)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <MessageFeedback 
                        messageId={message.timestamp?.getTime().toString() || 'unknown'}
                        onFeedback={onFeedback}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
