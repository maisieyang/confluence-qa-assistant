import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '../useAutoScroll';

describe('useAutoScroll', () => {
  it('returns scrollRef, scrollToBottom and isAtBottom', () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current.scrollRef).toBeDefined();
    expect(typeof result.current.scrollToBottom).toBe('function');
    expect(typeof result.current.isAtBottom).toBe('boolean');
  });

  it('scrollRef starts as null when no element is attached', () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current.scrollRef.current).toBeNull();
  });

  it('isAtBottom is true by default', () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(result.current.isAtBottom).toBe(true);
  });

  it('scrollToBottom does nothing when scrollRef is null', () => {
    const { result } = renderHook(() => useAutoScroll());
    expect(() => {
      act(() => {
        result.current.scrollToBottom();
      });
    }).not.toThrow();
  });

  it('scrollToBottom does nothing when enabled=false', () => {
    const { result } = renderHook(() => useAutoScroll({ enabled: false }));
    expect(() => {
      act(() => {
        result.current.scrollToBottom();
      });
    }).not.toThrow();
  });

  it('accepts custom threshold option', () => {
    const { result } = renderHook(() => useAutoScroll({ threshold: 50 }));
    expect(result.current.scrollRef).toBeDefined();
  });

  it('accepts custom behavior option', () => {
    const { result } = renderHook(() => useAutoScroll({ behavior: 'auto' }));
    expect(result.current.scrollRef).toBeDefined();
  });

  it('uses default options when none are provided', () => {
    const { result } = renderHook(() => useAutoScroll({}));
    expect(result.current.scrollRef).toBeDefined();
    expect(result.current.isAtBottom).toBe(true);
  });
});
