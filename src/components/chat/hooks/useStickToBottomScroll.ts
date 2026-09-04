"use client";

import { useCallback, useEffect, useRef, type UIEvent } from "react";

const NEAR_BOTTOM_PX = 120;

const isNearBottom = (el: HTMLElement) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;

/**
 * Follows new chat content without `scrollIntoView`.
 * Smooth `scrollIntoView` on every streamed token cancels touch scrolling
 * on some mobile browsers and can freeze the scroller on a long answer.
 */
export const useStickToBottomScroll = (
  itemCount: number,
  contentKey: unknown,
  threadKey?: unknown,
) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const touchingRef = useRef(false);
  const itemCountRef = useRef(itemCount);
  const threadKeyRef = useRef(threadKey);
  const rafRef = useRef(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const pinToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current || touchingRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const schedulePin = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      pinToBottom();
    });
  }, [pinToBottom]);

  const observe = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el) return;
      const inner = el.firstElementChild;
      if (!inner) return;
      const observer = new ResizeObserver(() => schedulePin());
      observer.observe(inner);
      observerRef.current = observer;
    },
    [schedulePin],
  );

  const scrollerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollerRef.current = node;
      observe(node);
      if (node && stickRef.current && !touchingRef.current) {
        node.scrollTop = node.scrollHeight;
      }
    },
    [observe],
  );

  const releaseTouch = useCallback(() => {
    touchingRef.current = false;
    const el = scrollerRef.current;
    if (el) stickRef.current = isNearBottom(el);
  }, []);

  const scrollerProps = {
    onScroll: (event: UIEvent<HTMLDivElement>) => {
      if (touchingRef.current) return;
      stickRef.current = isNearBottom(event.currentTarget);
    },
    onTouchStart: () => {
      touchingRef.current = true;
    },
    onTouchEnd: releaseTouch,
    onTouchCancel: releaseTouch,
  };

  useEffect(() => {
    if (threadKey !== threadKeyRef.current || itemCount !== itemCountRef.current) {
      stickRef.current = true;
    }
    threadKeyRef.current = threadKey;
    itemCountRef.current = itemCount;
    observe(scrollerRef.current);
    schedulePin();
  }, [itemCount, contentKey, threadKey, observe, schedulePin]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      observerRef.current?.disconnect();
    },
    [],
  );

  return { scrollerRef: scrollerCallbackRef, scrollerProps };
};
