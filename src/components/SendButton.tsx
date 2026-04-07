'use client';

import React from 'react';

interface SendButtonProps {
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
  onStop?: () => void;
}

export function SendButton({ isLoading, disabled, onClick, onStop }: SendButtonProps) {
  return (
    <button
      type={isLoading ? 'button' : 'submit'}
      disabled={isLoading ? false : disabled}
      onClick={isLoading ? onStop : onClick}
      className="flex items-center justify-center w-8 h-8 rounded-full bg-interactive-primary text-text-inverted hover:bg-interactive-primary-hover disabled:bg-bg-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed transition-all duration-150"
    >
      {isLoading ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M12 19V5m-7 7l7-7 7 7"
          />
        </svg>
      )}
    </button>
  );
}
