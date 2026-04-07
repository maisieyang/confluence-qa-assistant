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
  return (
    <div className={`${className}`}>
      {message.role === 'user' ? (
        /* User message - right aligned with background bubble */
        <div className="flex justify-end py-4">
          <div className="max-w-[85%] px-4 py-3 rounded-3xl bg-[var(--message-surface)] text-text-primary text-base whitespace-pre-wrap leading-relaxed">
            {message.content}
          </div>
        </div>
      ) : (
        /* Assistant message - left aligned, clean */
        <div className="py-4">
          <div className="prose prose-lg max-w-none text-base leading-relaxed">
            <MarkdownRenderer content={message.content} />
            {isStreaming && (
              <span
                className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse"
                style={{ animationDuration: '1s' }}
              />
            )}
          </div>

          {/* Feedback - appears on hover after streaming */}
          {!isStreaming && message.content && (
            <div className="flex items-center gap-1 mt-2 opacity-0 hover:opacity-100 transition-opacity duration-200">
              <MessageFeedback
                messageId={message.timestamp?.getTime().toString() || 'unknown'}
                onFeedback={onFeedback}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
