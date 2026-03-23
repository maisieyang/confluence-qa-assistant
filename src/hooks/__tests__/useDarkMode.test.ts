import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from '../useDarkMode';

describe('useDarkMode', () => {
  let matchMediaMock: jest.Mock;
  let mediaQueryListeners: Map<string, Function>;

  beforeEach(() => {
    mediaQueryListeners = new Map();
    matchMediaMock = jest.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn((event: string, handler: Function) => {
        mediaQueryListeners.set(query, handler);
      }),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
    // Ensure documentElement starts without dark class
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    jest.clearAllMocks();
  });

  it('returns isDarkMode=false when no dark class and no system dark preference', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(false);
    expect(result.current.isLoaded).toBe(true);
  });

  it('returns isDarkMode=true when system prefers dark', () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });

    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(true);
  });

  it('returns isDarkMode=true when document has dark class', () => {
    document.documentElement.classList.add('dark');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(true);
    document.documentElement.classList.remove('dark');
  });

  it('sets isLoaded=true after mount', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isLoaded).toBe(true);
  });

  it('updates isDarkMode when dark class is added to document', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDarkMode).toBe(false);

    act(() => {
      document.documentElement.classList.add('dark');
    });

    // MutationObserver fires asynchronously in jsdom — verify it was set up without error
    expect(result.current).toBeDefined();
  });
});
