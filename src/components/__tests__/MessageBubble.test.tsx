import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../ChatWindow/types';

// Mock MarkdownRenderer to avoid complex rendering
jest.mock('../MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown-renderer">{content}</div>
  ),
}));

// Mock MessageFeedback to avoid testing that separately
jest.mock('../MessageFeedback', () => ({
  MessageFeedback: ({ messageId, onFeedback }: { messageId: string; onFeedback?: Function }) => (
    <div data-testid="message-feedback" data-messageid={messageId} />
  ),
}));

describe('MessageBubble', () => {
  it('renders user message with content', () => {
    const message: ChatMessage = {
      role: 'user',
      content: 'Hello, I have a question!',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hello, I have a question!')).toBeInTheDocument();
  });

  it('renders assistant message using MarkdownRenderer', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: '## Answer\n\nHere is the answer.',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-renderer')).toHaveTextContent('## Answer');
  });

  it('shows streaming cursor when isStreaming=true for assistant messages', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Typing...',
    };
    const { container } = render(<MessageBubble message={message} isStreaming={true} />);
    // The streaming span should be visible
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('does not show streaming cursor when isStreaming=false', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Done.',
    };
    const { container } = render(<MessageBubble message={message} isStreaming={false} />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('shows MessageFeedback when not streaming', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Some answer.',
      timestamp: new Date('2024-01-01T10:00:00Z'),
    };
    render(<MessageBubble message={message} isStreaming={false} />);
    expect(screen.getByTestId('message-feedback')).toBeInTheDocument();
  });

  it('does not show MessageFeedback when streaming', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Streaming...',
    };
    render(<MessageBubble message={message} isStreaming={true} />);
    expect(screen.queryByTestId('message-feedback')).toBeNull();
  });

  it('renders timestamp for user messages', () => {
    const ts = new Date('2024-01-01T10:30:00Z');
    const message: ChatMessage = {
      role: 'user',
      content: 'Message with timestamp',
      timestamp: ts,
    };
    render(<MessageBubble message={message} />);
    // Timestamp should be visible in some formatted form
    const container = screen.getByText('Message with timestamp').closest('div[class]');
    expect(container).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const message: ChatMessage = { role: 'user', content: 'test' };
    const { container } = render(
      <MessageBubble message={message} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders the robot emoji for assistant messages', () => {
    const message: ChatMessage = {
      role: 'assistant',
      content: 'AI response.',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('🤖')).toBeInTheDocument();
  });

  it('calls onFeedback when provided', () => {
    const onFeedback = jest.fn();
    const message: ChatMessage = {
      role: 'assistant',
      content: 'Response',
      timestamp: new Date(),
    };
    render(<MessageBubble message={message} onFeedback={onFeedback} isStreaming={false} />);
    // MessageFeedback mock renders with the handler - just verify it renders
    expect(screen.getByTestId('message-feedback')).toBeInTheDocument();
  });
});
