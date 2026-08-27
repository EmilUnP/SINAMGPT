import { useCallback, useState } from "react";
import type { useLocale } from "@/components/LocaleProvider";
import type { ModelOption } from "../ModelPicker";
import { persistModelChoice, readStoredModel } from "../chat-storage";

type Translate = ReturnType<typeof useLocale>["t"];

export const useChatModels = (t: Translate) => {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [modelsError, setModelsError] = useState("");

  const loadModels = useCallback(async () => {
    const res = await fetch("/api/models");
    const data = (await res.json()) as {
      models?: ModelOption[];
      defaultModel?: string;
      error?: string;
    };
    if (!res.ok) {
      setModelsError(data.error || t("chat.ollamaUnavailable"));
      setModels([]);
      return;
    }
    const list = data.models ?? [];
    const names = new Set(list.map((item) => item.name));
    const fallback = data.defaultModel || list[0]?.name || "";
    setModels(list);
    setModelsError("");
    setModel((current) => {
      if (current && names.has(current)) return current;
      const stored = readStoredModel();
      return stored && names.has(stored) ? stored : fallback;
    });
  }, [t]);

  const selectModel = (name: string) => {
    setModel(name);
    persistModelChoice(name);
  };

  const restoreStoredModel = () => {
    const stored = readStoredModel();
    if (stored && models.some((item) => item.name === stored)) setModel(stored);
  };

  const selected = models.find((item) => item.name === model);

  return {
    models,
    model,
    setModel,
    modelsError,
    setModelsError,
    loadModels,
    selectModel,
    restoreStoredModel,
    modelLabel: (name: string) =>
      models.find((item) => item.name === name)?.display_name || name,
    supportsVision: Boolean(selected?.vision),
    supportsAudio: Boolean(selected?.audio),
    supportsTts: Boolean(selected?.tts),
  };
};
