import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageFeedback } from '../MessageFeedback';

describe('MessageFeedback', () => {
  const defaultProps = { messageId: 'msg-1', content: 'Test content' };

  it('renders copy, like and dislike buttons', () => {
    render(<MessageFeedback {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('renders copy button', () => {
    render(<MessageFeedback {...defaultProps} />);
    expect(screen.getByTitle('Copy')).toBeInTheDocument();
  });

  it('renders like button', () => {
    render(<MessageFeedback {...defaultProps} />);
    expect(screen.getByTitle('Good response')).toBeInTheDocument();
  });

  it('renders dislike button', () => {
    render(<MessageFeedback {...defaultProps} />);
    expect(screen.getByTitle('Bad response')).toBeInTheDocument();
  });

  it('calls onFeedback with like when like button is clicked', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback {...defaultProps} onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('Good response'));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('msg-1', 'like');
  });

  it('calls onFeedback with dislike when dislike button is clicked', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback {...defaultProps} onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('Bad response'));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('msg-1', 'dislike');
  });

  it('toggles feedback off when clicking the same button again', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback {...defaultProps} onFeedback={onFeedback} />);

    const likeBtn = screen.getByTitle('Good response');
    await userEvent.click(likeBtn);
    expect(onFeedback).toHaveBeenCalledWith('msg-1', 'like');

    // Click again to toggle off - should not call onFeedback again with a value
    await userEvent.click(likeBtn);
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onFeedback is not provided', async () => {
    render(<MessageFeedback {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Good response'));
    // No error expected
  });

  it('copies content to clipboard when copy button is clicked', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });

    render(<MessageFeedback {...defaultProps} />);
    await userEvent.click(screen.getByTitle('Copy'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test content');
  });

  it('passes the correct messageId', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback messageId="msg-42" content="text" onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('Good response'));
    expect(onFeedback).toHaveBeenCalledWith('msg-42', 'like');
  });
});
