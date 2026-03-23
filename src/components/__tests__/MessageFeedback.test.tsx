import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageFeedback } from '../MessageFeedback';

describe('MessageFeedback', () => {
  it('renders like and dislike buttons', () => {
    render(<MessageFeedback messageId="msg-1" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('renders like button with correct title', () => {
    render(<MessageFeedback messageId="msg-1" />);
    expect(screen.getByTitle('有用')).toBeInTheDocument();
  });

  it('renders dislike button with correct title', () => {
    render(<MessageFeedback messageId="msg-1" />);
    expect(screen.getByTitle('无用')).toBeInTheDocument();
  });

  it('calls onFeedback with like when like button is clicked', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback messageId="msg-1" onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('有用'));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('msg-1', 'like');
  });

  it('calls onFeedback with dislike when dislike button is clicked', async () => {
    const onFeedback = jest.fn();
    render(<MessageFeedback messageId="msg-1" onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('无用'));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('msg-1', 'dislike');
  });

  it('does not throw when onFeedback is not provided', async () => {
    render(<MessageFeedback messageId="msg-1" />);
    await userEvent.click(screen.getByTitle('有用'));
    // No error expected
  });

  it('applies the className prop to the container', () => {
    const { container } = render(<MessageFeedback messageId="msg-1" className="my-class" />);
    expect(container.firstChild).toHaveClass('my-class');
  });

  it('applies the like style when like feedback is selected', async () => {
    render(<MessageFeedback messageId="msg-1" />);
    const likeButton = screen.getByTitle('有用');

    await userEvent.click(likeButton);

    expect(likeButton).toHaveClass('text-success');
  });

  it('applies the dislike style when dislike feedback is selected', async () => {
    render(<MessageFeedback messageId="msg-1" />);
    const dislikeButton = screen.getByTitle('无用');

    await userEvent.click(dislikeButton);

    expect(dislikeButton).toHaveClass('text-error');
  });

  it('passes the correct messageId when multiple messages are present', async () => {
    const onFeedback = jest.fn();
    const { rerender } = render(<MessageFeedback messageId="msg-42" onFeedback={onFeedback} />);

    await userEvent.click(screen.getByTitle('有用'));
    expect(onFeedback).toHaveBeenCalledWith('msg-42', 'like');
  });
});
