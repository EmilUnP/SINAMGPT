import type { AppLocale } from "@/lib/locale";
import { az } from "./az";
import { en, type Messages } from "./en";

export type { Messages };
export type MessageNamespace = keyof Messages;

export const catalogs: Record<AppLocale, Messages> = {
  en,
  az,
};

type NestedKeyOf<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>
        : Prefix extends ""
          ? K
          : `${Prefix}.${K}`;
    }[keyof T & string]
  : never;

export type MessageKey = NestedKeyOf<Messages>;

export type TranslateVars = Record<string, string | number>;

const getByPath = (obj: unknown, path: string): string | undefined => {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
};

export const interpolate = (template: string, vars?: TranslateVars): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
};

export const translate = (
  locale: AppLocale,
  key: MessageKey,
  vars?: TranslateVars,
): string => {
  const primary = getByPath(catalogs[locale], key);
  const fallback = locale === "en" ? undefined : getByPath(catalogs.en, key);
  const raw = primary ?? fallback ?? key;
  return interpolate(raw, vars);
};
