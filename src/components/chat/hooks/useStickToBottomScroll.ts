"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";

const NEAR_BOTTOM_PX = 120;
/** How long to keep re-pinning after a thread opens, while layout settles. */
const SETTLE_MS = 700;

/**
 * Which follow behaviour an update needs. Pulled out of the effect so the
 * branching is testable without a DOM: the timing parts below are simple, this
 * part is where a mistake silently strands the reader mid-thread.
 */
export const planScrollUpdate = (input: {
  threadChanged: boolean;
  countChanged: boolean;
  awaitingThreadContent: boolean;
}): { plan: "settle" | "pin"; awaitingThreadContent: boolean } => {
  // A thread opened: settle now, and stay armed until its messages arrive.
  if (input.threadChanged) {
    return { plan: "settle", awaitingThreadContent: true };
  }
  // Those messages just landed — settle again against the real content.
  if (input.countChanged && input.awaitingThreadContent) {
    return { plan: "settle", awaitingThreadContent: false };
  }
  // Ordinary growth (a streamed token, a new activity step): one cheap pin.
  return { plan: "pin", awaitingThreadContent: input.awaitingThreadContent };
};

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
  // Mirrors stickRef as state so the caller can offer a "jump to latest"
  // control. A long search leaves the reply below the fold, and once the
  // reader scrolls up nothing re-arms following until the next message.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const touchingRef = useRef(false);
  const itemCountRef = useRef(itemCount);
  const threadKeyRef = useRef(threadKey);
  const rafRef = useRef(0);
  const settleRafRef = useRef(0);
  const settleUntilRef = useRef(0);
  const awaitingThreadContentRef = useRef(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setStick = useCallback((next: boolean) => {
    if (stickRef.current === next) return;
    stickRef.current = next;
    setIsAtBottom(next);
  }, []);

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

  /**
   * Opening a saved chat lands the view mid-thread. `openConversation` sets the
   * active id before awaiting the fetch, so the first pin happens against the
   * previous thread's content; and one frame after the new messages commit the
   * layout is still growing as markdown, tables, and images resolve. Keep
   * pinning across a short window so the view ends up at the newest message.
   *
   * Safe to run: `pinToBottom` bails the moment the reader scrolls away or
   * touches the scroller, so this never fights a deliberate scroll.
   */
  const settleToBottom = useCallback(() => {
    settleUntilRef.current = Date.now() + SETTLE_MS;
    if (settleRafRef.current) return;
    const tick = () => {
      pinToBottom();
      if (!stickRef.current || Date.now() >= settleUntilRef.current) {
        settleRafRef.current = 0;
        return;
      }
      settleRafRef.current = requestAnimationFrame(tick);
    };
    settleRafRef.current = requestAnimationFrame(tick);
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
    if (el) setStick(isNearBottom(el));
  }, [setStick]);

  /** Re-arm following and jump down — used by the "latest" button. */
  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    setStick(true);
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [setStick]);

  const scrollerProps = {
    onScroll: (event: UIEvent<HTMLDivElement>) => {
      if (touchingRef.current) return;
      setStick(isNearBottom(event.currentTarget));
    },
    onTouchStart: () => {
      touchingRef.current = true;
    },
    onTouchEnd: releaseTouch,
    onTouchCancel: releaseTouch,
  };

  useEffect(() => {
    const threadChanged = threadKey !== threadKeyRef.current;
    const countChanged = itemCount !== itemCountRef.current;
    if (threadChanged || countChanged) {
      setStick(true);
    }
    threadKeyRef.current = threadKey;
    itemCountRef.current = itemCount;
    observe(scrollerRef.current);

    /*
     * `openConversation` sets the active id before awaiting the fetch, so the
     * thread key changes while the previous thread's messages are still on
     * screen. Settle once now, then again when the real messages land — a
     * fetch slower than SETTLE_MS would otherwise miss the window entirely.
     */
    const decision = planScrollUpdate({
      threadChanged,
      countChanged,
      awaitingThreadContent: awaitingThreadContentRef.current,
    });
    awaitingThreadContentRef.current = decision.awaitingThreadContent;
    if (decision.plan === "settle") settleToBottom();
    else schedulePin();
  }, [
    itemCount,
    contentKey,
    threadKey,
    observe,
    schedulePin,
    settleToBottom,
    setStick,
  ]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(settleRafRef.current);
      observerRef.current?.disconnect();
    },
    [],
  );

  return {
    scrollerRef: scrollerCallbackRef,
    scrollerProps,
    isAtBottom,
    scrollToBottom,
  };
};
