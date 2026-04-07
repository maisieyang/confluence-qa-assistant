import type { ReactNode } from 'react';

export interface ReferenceLink {
  index: number;
  title: string;
  url?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  references?: ReferenceLink[];
  metadata?: Record<string, unknown>;
}

export interface RenderMessageParams {
  message: ChatMessage;
  index: number;
  messages: ChatMessage[];
  isStreaming: boolean;
  onFeedback: (messageId: string, feedback: 'like' | 'dislike') => void;
}

export interface EmptyStateConfig {
  icon?: string;
  headline: string;
  description?: string;
  suggestions?: string[];
  /** When true, clicking a suggestion sends it as a message. Default: true */
  suggestionsClickable?: boolean;
}

// ChatWindow 组件的 Props 接口
export interface ChatWindowProps {
  apiUrl: string;
  placeholder?: string;
  className?: string;
  title?: string;
  emptyState?: EmptyStateConfig;
  renderMessage?: (params: RenderMessageParams) => React.ReactNode;
  requestMetadata?: Record<string, unknown>;
  headerActions?: ReactNode;
}
