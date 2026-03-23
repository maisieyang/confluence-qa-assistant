import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeCopyButton } from '../CodeCopyButton';

describe('CodeCopyButton', () => {
  const mockWriteText = jest.fn();

  beforeEach(() => {
    mockWriteText.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText },
    });
  });

  it('renders a button', () => {
    render(<CodeCopyButton code="const x = 1;" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has the copy title initially', () => {
    render(<CodeCopyButton code="const x = 1;" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', '复制代码');
  });

  it('copies code to clipboard when clicked', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CodeCopyButton code="const x = 1;" />);

    await userEvent.click(screen.getByRole('button'));

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    expect(mockWriteText).toHaveBeenCalledWith('const x = 1;');
  });

  it('shows copied state after a successful copy', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CodeCopyButton code="hello world" />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAttribute('title', '已复制!');
  });

  it('reverts to copy state after 2 seconds', async () => {
    jest.useFakeTimers();
    mockWriteText.mockResolvedValue(undefined);
    render(<CodeCopyButton code="hello world" />);

    // Use fireEvent to avoid userEvent conflicts with fake timers
    fireEvent.click(screen.getByRole('button'));

    // Wait for the async clipboard call to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button')).toHaveAttribute('title', '已复制!');

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button')).toHaveAttribute('title', '复制代码');
    jest.useRealTimers();
  });

  it('handles clipboard write failure gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockWriteText.mockRejectedValue(new Error('Clipboard error'));

    render(<CodeCopyButton code="const x = 1;" />);
    await userEvent.click(screen.getByRole('button'));

    expect(consoleSpy).toHaveBeenCalledWith('Failed to copy code:', expect.any(Error));
    // Button title should remain unchanged (no copied state on failure)
    expect(screen.getByRole('button')).toHaveAttribute('title', '复制代码');

    consoleSpy.mockRestore();
  });

  it('applies the className prop', () => {
    render(<CodeCopyButton code="x" className="my-custom-class" />);
    expect(screen.getByRole('button')).toHaveClass('my-custom-class');
  });
});
