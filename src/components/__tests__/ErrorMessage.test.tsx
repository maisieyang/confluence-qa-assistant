import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorMessage } from '../ErrorMessage';

describe('ErrorMessage', () => {
  it('renders nothing when error is null', () => {
    const { container } = render(<ErrorMessage error={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the error message text', () => {
    render(<ErrorMessage error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('renders the Retry button when onRetry is provided and canRetry is true', () => {
    render(<ErrorMessage error="Oops" onRetry={jest.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('does not render the Retry button when retryCount >= maxRetries', () => {
    render(<ErrorMessage error="Oops" onRetry={jest.fn()} retryCount={3} maxRetries={3} />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('calls onRetry when Retry button is clicked', async () => {
    const onRetry = jest.fn();
    render(<ErrorMessage error="Oops" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the Dismiss button when onDismiss is provided', () => {
    render(<ErrorMessage error="Oops" onDismiss={jest.fn()} />);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onDismiss when Dismiss button is clicked', async () => {
    const onDismiss = jest.fn();
    render(<ErrorMessage error="Oops" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows retry attempt counter when retryCount > 0', () => {
    render(<ErrorMessage error="Oops" retryCount={2} maxRetries={3} />);
    expect(screen.getByText('Retry attempt: 2/3')).toBeInTheDocument();
  });

  it('does not show retry counter when retryCount is 0', () => {
    render(<ErrorMessage error="Oops" retryCount={0} maxRetries={3} />);
    expect(screen.queryByText(/retry attempt/i)).toBeNull();
  });

  it('renders both Retry and Dismiss buttons when both callbacks are provided', () => {
    render(<ErrorMessage error="Oops" onRetry={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('does not render Retry button when onRetry is not provided', () => {
    render(<ErrorMessage error="Oops" onDismiss={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
