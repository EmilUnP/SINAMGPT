import { describe, expect, it } from "vitest";
import { planScrollUpdate } from "@/components/chat/hooks/useStickToBottomScroll";

describe("scroll follow plan", () => {
  it("settles when a thread opens and stays armed for its content", () => {
    // openConversation() sets the active id BEFORE awaiting the fetch, so at
    // this point the previous thread's messages are still on screen.
    expect(
      planScrollUpdate({
        threadChanged: true,
        countChanged: false,
        awaitingThreadContent: false,
      }),
    ).toEqual({ plan: "settle", awaitingThreadContent: true });
  });

  it("settles again when the opened thread's messages finally land", () => {
    expect(
      planScrollUpdate({
        threadChanged: false,
        countChanged: true,
        awaitingThreadContent: true,
      }),
    ).toEqual({ plan: "settle", awaitingThreadContent: false });
  });

  it("only settles once for that content, not on every later message", () => {
    const after = planScrollUpdate({
      threadChanged: false,
      countChanged: true,
      awaitingThreadContent: false,
    });
    expect(after).toEqual({ plan: "pin", awaitingThreadContent: false });
  });

  it("uses a cheap pin for streamed tokens and activity steps", () => {
    expect(
      planScrollUpdate({
        threadChanged: false,
        countChanged: false,
        awaitingThreadContent: false,
      }),
    ).toEqual({ plan: "pin", awaitingThreadContent: false });
  });

  it("treats a thread change during a pending open as a fresh open", () => {
    expect(
      planScrollUpdate({
        threadChanged: true,
        countChanged: true,
        awaitingThreadContent: true,
      }),
    ).toEqual({ plan: "settle", awaitingThreadContent: true });
  });
});
