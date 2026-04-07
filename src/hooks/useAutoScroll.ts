'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoScrollOptions {
  enabled?: boolean;
  behavior?: ScrollBehavior;
  threshold?: number;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const {
    enabled = true,
    behavior = 'smooth',
    threshold = 100
  } = options;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current && enabled) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior
      });
    }
  }, [enabled, behavior]);

  const checkIfAtBottom = useCallback(() => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < threshold;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    return atBottom;
  }, [threshold]);

  // Track user scroll position
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const handleScroll = () => {
      checkIfAtBottom();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll when content changes (streaming, new messages)
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !enabled) return;

    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current) {
        // Use instant scroll during streaming for smooth experience
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'instant'
        });
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [enabled]);

  return {
    scrollRef,
    scrollToBottom,
    isAtBottom
  };
}
