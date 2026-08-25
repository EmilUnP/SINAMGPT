"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Mic, Pause, Play, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { MAX_AUDIO_SECONDS } from "@/lib/audio-limits";

type MessageAudioProps = {
  src: string;
  name?: string;
  durationMs?: number;
  onRemove?: () => void;
  removeLabel?: string;
  tone?: "user" | "composer";
};

const BAR_COUNT = 32;
const peaksCache = new Map<string, number[]>();

export const formatVoiceTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  return `${m}:${String(total % 60).padStart(2, "0")}`;
};

const dummyBars = (seed: string): number[] => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const n = ((h >>> 0) % 1000) / 1000;
    const env = 0.35 + 0.65 * Math.sin((i / (BAR_COUNT - 1)) * Math.PI);
    return 0.18 + env * (0.22 + 0.78 * n);
  });
};

const peaksFromBuffer = (buffer: AudioBuffer): number[] => {
  const data = buffer.getChannelData(0);
  const window = Math.max(1, Math.floor(data.length / BAR_COUNT));
  const bars = new Array<number>(BAR_COUNT).fill(0.16);
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const start = i * window;
    const end = Math.min(data.length, start + window);
    let peak = 0;
    let sum = 0;
    for (let j = start; j < end; j += 1) {
      const a = Math.abs(data[j]);
      if (a > peak) peak = a;
      sum += a;
    }
    const rms = sum / Math.max(1, end - start);
    bars[i] = Math.max(peak * 0.9, rms * 2.4);
  }
  const max = Math.max(...bars, 0.08);
  return bars.map((value) => 0.16 + 0.84 * Math.min(1, value / max));
};

const loadPeaks = async (src: string): Promise<number[]> => {
  const cached = src.startsWith("data:") ? undefined : peaksCache.get(src);
  if (cached) return cached;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return dummyBars(src);
  const res = await fetch(src);
  const raw = await res.arrayBuffer();
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(raw.slice(0));
    const peaks = peaksFromBuffer(decoded);
    if (!src.startsWith("data:")) peaksCache.set(src, peaks);
    return peaks;
  } finally {
    await ctx.close().catch(() => undefined);
  }
};

const WaveBars = ({
  bars,
  progress,
  barClass,
  playedClass,
}: {
  bars: number[];
  progress: number;
  barClass: string;
  playedClass: string;
}) => (
  <div className="flex h-8 min-w-0 flex-1 items-end gap-[2px]" aria-hidden>
    {bars.map((height, index) => {
      const played = index / bars.length <= progress;
      return (
        <span
          key={index}
          className={`w-full max-w-[4px] rounded-full ${played ? playedClass : barClass}`}
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      );
    })}
  </div>
);

export const VoiceRecordingPreview = ({
  elapsedMs,
  level,
  label,
}: {
  elapsedMs: number;
  level: number;
  label: string;
}) => {
  const seconds = Math.min(MAX_AUDIO_SECONDS, Math.ceil(elapsedMs / 1000));
  return (
    <div className="flex items-center gap-3 px-1 pt-1">
      <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/35" />
        <Mic size={16} />
      </span>
      <div className="flex h-8 min-w-0 flex-1 items-end gap-[2px]" aria-hidden>
        {Array.from({ length: 36 }, (_, i) => {
          const pulse =
            0.2 +
            Math.min(1, level * 1.8) *
              (0.3 + 0.7 * Math.abs(Math.sin(i * 0.55 + elapsedMs / 90)));
          return (
            <span
              key={i}
              className="w-full max-w-[4px] rounded-full bg-red-500/85"
              style={{ height: `${Math.round(pulse * 100)}%` }}
            />
          );
        })}
      </div>
      <span className="shrink-0 tabular-nums text-xs font-medium text-red-600">
        {formatVoiceTime(seconds)}
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
};

export const MessageAudio = ({
  src,
  name,
  durationMs,
  onRemove,
  removeLabel,
  tone = "user",
}: MessageAudioProps) => {
  const { t } = useLocale();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(
    durationMs && durationMs > 0 ? durationMs / 1000 : 0,
  );
  const [bars, setBars] = useState<number[]>(() => dummyBars(src));
  const resolvedRemove = removeLabel || t("chat.removeAudio");
  const resolvedName = name || t("chat.voiceRecording");
  const isUser = tone === "user";

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(durationMs && durationMs > 0 ? durationMs / 1000 : 0);
    setBars(dummyBars(src));
    let cancelled = false;
    void loadPeaks(src)
      .then((next) => {
        if (!cancelled) setBars(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src, durationMs]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const handleTime = () => setCurrent(el.currentTime);
    const handleMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("timeupdate", handleTime);
    el.addEventListener("loadedmetadata", handleMeta);
    el.addEventListener("ended", handleEnded);
    return () => {
      el.removeEventListener("timeupdate", handleTime);
      el.removeEventListener("loadedmetadata", handleMeta);
      el.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [playing]);

  const handleSeek = (event: MouseEvent<HTMLButtonElement>) => {
    const el = audioRef.current;
    if (!el || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrent(el.currentTime);
  };

  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const shown = playing || current > 0 ? current : duration;

  return (
    <div
      className={`flex max-w-[16.5rem] items-center gap-2 sm:max-w-[18rem] ${
        isUser ? "" : "rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5"
      }`}
    >
      <audio ref={audioRef} preload="metadata" src={src} className="hidden">
        <source src={src} type="audio/wav" />
      </audio>
      <button
        type="button"
        onClick={() => void togglePlay()}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${
          isUser
            ? "bg-white text-blue-600 hover:bg-white/90"
            : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        }`}
        aria-label={playing ? t("chat.pauseVoice") : t("chat.playVoice")}
      >
        {playing ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" className="ml-0.5" />
        )}
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer"
        onClick={handleSeek}
        aria-label={resolvedName}
      >
        <WaveBars
          bars={bars}
          progress={progress}
          barClass={isUser ? "bg-white/35" : "bg-[var(--accent)]/25"}
          playedClass={isUser ? "bg-white" : "bg-[var(--accent)]"}
        />
      </button>
      <span
        className={`shrink-0 tabular-nums text-[11px] font-medium ${
          isUser ? "text-white/90" : "text-[var(--text-muted)]"
        }`}
      >
        {formatVoiceTime(shown)}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          aria-label={resolvedRemove}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
};
