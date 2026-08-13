"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@/components/LocaleProvider";

export type LabChartPoint = {
  index: number;
  label: string;
  status: "queued" | "running" | "pass" | "fail";
  accuracy: number | null;
  speed: number | null;
  speedIsTokens: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  pass: boolean | null;
};

const formatMs = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

const niceMax = (raw: number) => {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
};

const LabBarChart = ({
  values,
  max,
  labels,
  formatTick,
  formatValue,
  colorFor,
}: {
  values: Array<number | null>;
  max: number;
  labels: string[];
  formatTick: (n: number) => string;
  formatValue: (n: number) => string;
  colorFor?: (n: number) => string;
}) => {
  const w = 640;
  const h = 176;
  const padL = 40;
  const padB = 22;
  const padT = 10;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = Math.max(values.length, 1);
  const slot = innerW / n;
  const barW = Math.max(3, slot * 0.64);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-44 w-full [&_rect]:transition-all [&_rect]:duration-300"
      role="img"
    >
      {ticks.map((p) => {
        const y = padT + innerH * (1 - p);
        return (
          <g key={p}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="var(--admin-border)"
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--admin-muted)"
            >
              {formatTick(max * p)}
            </text>
          </g>
        );
      })}
      {values.map((v, i) => {
        const x = padL + i * slot + (slot - barW) / 2;
        if (v == null) {
          return (
            <rect
              key={i}
              x={x}
              y={padT + innerH - 3}
              width={barW}
              height={3}
              rx={1.5}
              fill="var(--admin-border)"
            >
              <title>{labels[i]}</title>
            </rect>
          );
        }
        const bh = Math.max(2, (v / max) * innerH);
        return (
          <rect
            key={i}
            x={x}
            y={padT + innerH - bh}
            width={barW}
            height={bh}
            rx={2}
            fill={colorFor?.(v) ?? "var(--accent)"}
          >
            <title>
              {labels[i]}: {formatValue(v)}
            </title>
          </rect>
        );
      })}
      {values.map((_, i) =>
        i === 0 || i === n - 1 || (i + 1) % Math.ceil(n / 8) === 0 ? (
          <text
            key={`x-${i}`}
            x={padL + i * slot + slot / 2}
            y={h - 6}
            textAnchor="middle"
            fontSize="9"
            fill="var(--admin-muted)"
          >
            {i + 1}
          </text>
        ) : null,
      )}
    </svg>
  );
};

const LabDualBarChart = ({
  primary,
  secondary,
  max,
  labels,
  primaryLabel,
  secondaryLabel,
}: {
  primary: Array<number | null>;
  secondary: Array<number | null>;
  max: number;
  labels: string[];
  primaryLabel: string;
  secondaryLabel: string;
}) => {
  const w = 640;
  const h = 176;
  const padL = 44;
  const padB = 22;
  const padT = 10;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = Math.max(primary.length, 1);
  const slot = innerW / n;
  const pairW = Math.max(6, slot * 0.7);
  const barW = pairW / 2 - 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-44 w-full [&_rect]:transition-all [&_rect]:duration-300"
      role="img"
    >
      {ticks.map((p) => {
        const y = padT + innerH * (1 - p);
        return (
          <g key={p}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="var(--admin-border)"
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--admin-muted)"
            >
              {formatMs(max * p)}
            </text>
          </g>
        );
      })}
      {primary.map((a, i) => {
        const x0 = padL + i * slot + (slot - pairW) / 2;
        const b = secondary[i] ?? null;
        const ha = a == null ? 3 : Math.max(2, (a / max) * innerH);
        const hb = b == null ? 3 : Math.max(2, (b / max) * innerH);
        return (
          <g key={i}>
            <rect
              x={x0}
              y={padT + innerH - ha}
              width={barW}
              height={ha}
              rx={2}
              fill={a == null ? "var(--admin-border)" : "var(--accent)"}
            >
              <title>
                {labels[i]} · {primaryLabel}: {a == null ? "—" : formatMs(a)}
              </title>
            </rect>
            <rect
              x={x0 + barW + 2}
              y={padT + innerH - hb}
              width={barW}
              height={hb}
              rx={2}
              fill={b == null ? "var(--admin-border)" : "var(--status-info-fg)"}
            >
              <title>
                {labels[i]} · {secondaryLabel}: {b == null ? "—" : formatMs(b)}
              </title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
};

const LabLineChart = ({
  values,
  labels,
}: {
  values: Array<number | null>;
  labels: string[];
}) => {
  const w = 640;
  const h = 176;
  const padL = 36;
  const padB = 22;
  const padT = 10;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = Math.max(values.length, 1);
  const known = values
    .map((v, i) => (v == null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p != null);
  const xAt = (i: number) =>
    padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH * (1 - v / 100);
  const d = known
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${xAt(p.i)} ${yAt(p.v)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img">
      {[0, 25, 50, 75, 100].map((p) => {
        const y = yAt(p);
        return (
          <g key={p}>
            <line
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="var(--admin-border)"
            />
            <text
              x={padL - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="9"
              fill="var(--admin-muted)"
            >
              {p}%
            </text>
          </g>
        );
      })}
      {d ? (
        <path
          d={d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {known.map((p) => (
        <circle
          key={p.i}
          cx={xAt(p.i)}
          cy={yAt(p.v)}
          r="3.5"
          fill="var(--accent)"
        >
          <title>
            {labels[p.i]}: {Math.round(p.v)}%
          </title>
        </circle>
      ))}
    </svg>
  );
};

const ChartCard = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3.5 py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">
        {title}
      </p>
      {hint ? (
        <p className="text-[11px] text-[var(--admin-muted)]">{hint}</p>
      ) : null}
    </div>
    <div className="mt-2">{children}</div>
  </div>
);

export const LabCharts = ({ points }: { points: LabChartPoint[] }) => {
  const t = useTranslations();
  const done = points.filter(
    (p) => p.status === "pass" || p.status === "fail",
  );
  const labels = points.map((p) => `${p.index}. ${p.label}`);
  const accuracy = points.map((p) => p.accuracy);
  const speed = points.map((p) => p.speed);
  const ttft = points.map((p) => p.ttftMs);
  const total = points.map((p) => p.totalMs);
  const hasAccuracy = accuracy.some((n) => n != null);
  const hasSpeed = speed.some((n) => n != null);
  const hasLatency = ttft.some((n) => n != null) || total.some((n) => n != null);
  const speedIsTokens = points.some((p) => p.speedIsTokens && p.speed != null);

  let seen = 0;
  let ok = 0;
  const passRate = points.map((p) => {
    if (p.pass == null) return null;
    seen += 1;
    if (p.pass) ok += 1;
    return Math.round((ok / seen) * 100);
  });

  const speedMax = niceMax(Math.max(...speed.filter((n): n is number => n != null), 1));
  const latencyMax = niceMax(
    Math.max(
      ...[...ttft, ...total].filter((n): n is number => n != null && n > 0),
      1,
    ),
  );

  if (!done.length) {
    return (
      <div className="px-4 py-12 text-center text-sm text-[var(--admin-muted)]">
        {t("lab.chartsEmpty")}
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {hasAccuracy ? (
      <ChartCard
        title={t("lab.chartAccuracy")}
        hint={t("lab.chartByCase")}
      >
        <LabBarChart
          values={accuracy}
          max={100}
          labels={labels}
          formatTick={(n) => `${Math.round(n)}%`}
          formatValue={(n) => `${Math.round(n)}%`}
          colorFor={(n) =>
            n >= 70
              ? "var(--status-ok-fg)"
              : n >= 50
                ? "var(--status-warn-fg)"
                : "var(--status-bad-fg)"
          }
        />
      </ChartCard>
      ) : null}
      {hasSpeed ? (
      <ChartCard
        title={t("lab.chartSpeed")}
        hint={t(speedIsTokens ? "lab.chartTokHint" : "lab.chartCharHint")}
      >
        <LabBarChart
          values={speed}
          max={speedMax}
          labels={labels}
          formatTick={(n) => `${Math.round(n)}`}
          formatValue={(n) =>
            t(speedIsTokens ? "lab.tokPerSec" : "lab.charsPerSec", {
              n: Math.round(n),
            })
          }
          colorFor={() => "var(--accent)"}
        />
      </ChartCard>
      ) : null}
      {hasLatency ? (
      <ChartCard
        title={t("lab.chartLatency")}
        hint={`${t("lab.ttft")} · ${t("lab.total")}`}
      >
        <LabDualBarChart
          primary={ttft}
          secondary={total}
          max={latencyMax}
          labels={labels}
          primaryLabel={t("lab.ttft")}
          secondaryLabel={t("lab.total")}
        />
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--admin-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--accent)]" />
            {t("lab.ttft")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[var(--status-info-fg)]" />
            {t("lab.total")}
          </span>
        </div>
      </ChartCard>
      ) : null}
      <ChartCard
        title={t("lab.chartPassRate")}
        hint={t("lab.chartPassRateHint")}
      >
        <LabLineChart values={passRate} labels={labels} />
      </ChartCard>
    </div>
  );
};
