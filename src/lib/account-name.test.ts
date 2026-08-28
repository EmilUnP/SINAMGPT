import { describe, expect, it } from "vitest";
import { displayAccountName, parseAccountName } from "@/lib/account-name";

describe("parseAccountName", () => {
  it("accepts a short username", () => {
    expect(parseAccountName("  emil  ")).toEqual({ ok: true, value: "emil" });
  });

  it("accepts a work email", () => {
    expect(parseAccountName("Emil.Mammadov@sinam.az")).toEqual({
      ok: true,
      value: "Emil.Mammadov@sinam.az",
    });
  });

  it("accepts plus-tagged emails", () => {
    expect(parseAccountName("user+gpt@company.com").ok).toBe(true);
  });

  it("rejects empty input", () => {
    expect(parseAccountName("   ")).toEqual({ ok: false, issue: "empty" });
  });

  it("rejects a username that is too short", () => {
    expect(parseAccountName("ab")).toEqual({ ok: false, issue: "min" });
  });

  it("rejects an incomplete email", () => {
    expect(parseAccountName("emil@sinam")).toEqual({
      ok: false,
      issue: "email",
    });
  });

  it("rejects spaces and other punctuation in usernames", () => {
    expect(parseAccountName("emil m")).toEqual({ ok: false, issue: "chars" });
  });
});

describe("displayAccountName", () => {
  it("uses the local part of an email in greetings", () => {
    expect(displayAccountName("emil@sinam.az")).toBe("emil");
  });

  it("keeps a plain username", () => {
    expect(displayAccountName("emil")).toBe("emil");
  });
});
