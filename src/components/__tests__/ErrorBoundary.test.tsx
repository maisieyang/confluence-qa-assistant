import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders default error UI when a global error event fires', async () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      const errorEvent = new ErrorEvent('error', { message: 'Test error message' });
      window.dispatchEvent(errorEvent);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('renders custom fallback when provided and error occurs', async () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      const errorEvent = new ErrorEvent('error', { message: 'Boom' });
      window.dispatchEvent(errorEvent);
    });

    expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('calls onError callback when error fires', async () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary onError={onError}>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      const errorEvent = new ErrorEvent('error', { message: 'Callback error' });
      window.dispatchEvent(errorEvent);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ errorBoundary: 'ErrorBoundary' })
    );
  });

  it('resets error state when "Try again" button is clicked', async () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Crash' }));
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.queryByText('Something went wrong')).toBeNull();
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('handles unhandled promise rejection events', async () => {
    // jsdom does not support PromiseRejectionEvent, so we simulate it
    // by polyfilling and dispatching a minimal event with a reason property.
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = new Error('Unhandled rejection');
      window.dispatchEvent(event);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Unhandled rejection')).toBeInTheDocument();
  });

  it('handles non-Error rejection reasons as strings', async () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>
    );

    await act(async () => {
      const event = new Event('unhandledrejection') as Event & { reason: unknown };
      event.reason = 'string reason';
      window.dispatchEvent(event);
    });

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('string reason')).toBeInTheDocument();
  });

  it('cleans up event listeners on unmount', async () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <ErrorBoundary>
        <div>Content</div>
      </ErrorBoundary>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });
});
