'use client';

import React, { useState, useCallback } from 'react';

interface MessageFeedbackProps {
  messageId: string;
  content: string;
  onFeedback?: (messageId: string, feedback: 'like' | 'dislike') => void;
}

export function MessageFeedback({ messageId, content, onFeedback }: MessageFeedbackProps) {
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleFeedback = (type: 'like' | 'dislike') => {
    const newValue = feedback === type ? null : type;
    setFeedback(newValue);
    if (newValue) {
      onFeedback?.(messageId, newValue);
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* Copy */}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-150"
        title="Copy"
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {/* Thumbs up */}
      <button
        type="button"
        onClick={() => handleFeedback('like')}
        className={`p-1.5 rounded-md transition-colors duration-150 ${
          feedback === 'like'
            ? 'text-text-primary bg-bg-tertiary'
            : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
        title="Good response"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 11v10M3 14v4a3 3 0 0 0 3 3h8.16a3 3 0 0 0 2.95-2.46l1.26-7A3 3 0 0 0 15.41 8H12V4a2 2 0 0 0-2-2h-.09a1 1 0 0 0-.93.65L7 11z" />
        </svg>
      </button>

      {/* Thumbs down */}
      <button
        type="button"
        onClick={() => handleFeedback('dislike')}
        className={`p-1.5 rounded-md transition-colors duration-150 ${
          feedback === 'dislike'
            ? 'text-text-primary bg-bg-tertiary'
            : 'text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary'
        }`}
        title="Bad response"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 13V3M21 10V6a3 3 0 0 0-3-3H9.84a3 3 0 0 0-2.95 2.46l-1.26 7A3 3 0 0 0 8.59 16H12v4a2 2 0 0 0 2 2h.09a1 1 0 0 0 .93-.65L17 13z" />
        </svg>
      </button>
    </div>
  );
}
