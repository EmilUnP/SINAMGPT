import { describe, expect, it } from "vitest";
import {
  detectReplyLanguage,
  expandQueryTokens,
  looksLikeCompanyQuestion,
  normalizeMultilangText,
  tokenizeMultilang,
  tokensAlign,
} from "@/lib/multilang";

describe("multi-language text helpers", () => {
  it("normalizes punctuation without losing Azerbaijani or Russian letters", () => {
    expect(normalizeMultilangText("  Əlaqə, ŞİRKƏT! Компания? ")).toBe(
      "əlaqə şirkət компания",
    );
    expect(tokenizeMultilang("SINAM — əlaqə")).toEqual(["sinam", "əlaqə"]);
  });

  it("aligns common inflections but not unrelated short words", () => {
    expect(tokensAlign("əməkdaş", "əməkdaşı")).toBe(true);
    expect(tokensAlign("компания", "компании")).toBe(true);
    expect(tokensAlign("hell", "hello")).toBe(false);
  });

  it("expands company concepts across EN, AZ, and RU", () => {
    const tokens = expandQueryTokens("vacation policy");
    expect(tokens).toEqual(
      expect.arrayContaining(["vacation", "məzuniyyət", "отпуск"]),
    );
  });

  it("separates company questions from general questions", () => {
    expect(looksLikeCompanyQuestion("SINAM əlaqə məlumatı nədir?")).toBe(true);
    expect(looksLikeCompanyQuestion("What is artificial intelligence?")).toBe(
      false,
    );
  });

  it("detects ASCII Azerbaijani and Russian prompts", () => {
    expect(detectReplyLanguage("Zehmet olmasa mene melumat verin").code).toBe(
      "az",
    );
    expect(detectReplyLanguage("Пожалуйста, объясните этот документ").code).toBe(
      "ru",
    );
  });
});
