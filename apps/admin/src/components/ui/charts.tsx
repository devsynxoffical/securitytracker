'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * Lightweight SVG charts following the dataviz method: thin marks, 2px gaps between fills,
 * recessive grid, one axis, categorical hues in fixed series order (never cycled), hover
 * tooltips by default, text in ink tokens (never the series colour), and a table view for
 * accessibility. Series colours come from --series-1..8 (validated in both themes).
 */

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

export interface Datum {
  label: string;
  value: number;
  /** Fixed series slot (0-based). Defaults to the datum's index. */
  series?: number;
  meta?: string;
}

const fmt = (n: number, f?: (n: number) => string) => (f ? f(n) : Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n));

// ---------------------------------------------------------------------------
// Tooltip (shared)
// ---------------------------------------------------------------------------

function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-pop" style={{ left: x, top: y - 8 }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline: tiny line for KPI tiles, no axes, optional area
// ---------------------------------------------------------------------------

export function Sparkline({ values, width = 96, height = 28, series = 0, className }: { values: number[]; width?: number; height?: number; series?: number; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 2) + 1, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1]![0].toFixed(1)},${height} L${pts[0]![0].toFixed(1)},${height} Z`;
  const colour = SERIES[series % SERIES.length];
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={area} fill={colour} opacity={0.12} />
      <path d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.5} fill={colour} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar list: ranked magnitudes (apps, stages, employees)
// ---------------------------------------------------------------------------

export function BarList({ data, format, max, series = 0, className, onPick }: { data: Datum[]; format?: (n: number) => string; max?: number; series?: number; className?: string; onPick?: (d: Datum) => void }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <div className="py-6 text-center text-xs text-ink-3">No data</div>;
  return (
    <ul className={clsx('space-y-2', className)}>
      {data.map((d, i) => (
        <li key={d.label + i} className={clsx('group', onPick && 'cursor-pointer')} onClick={onPick ? () => onPick(d) : undefined}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-ink">{d.label}</span>
            <span className="font-mono text-ink-2">{fmt(d.value, format)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-gray-soft">
            <div className="h-full rounded transition-[width] duration-300 group-hover:opacity-90" style={{ width: `${Math.max(1.5, (d.value / top) * 100)}%`, background: SERIES[(d.series ?? series) % SERIES.length] }} />
          </div>
          {d.meta && <div className="mt-0.5 text-2xs normal-case tracking-normal text-ink-3">{d.meta}</div>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Column chart: categories on x, magnitude on y, single or grouped series
// ---------------------------------------------------------------------------

export interface ColumnSeries {
  name: string;
  values: number[];
}

export function ColumnChart({ categories, series, height = 180, format, stacked = false, className }: { categories: string[]; series: ColumnSeries[]; height?: number; format?: (n: number) => string; stacked?: boolean; className?: string }) {
  const [hover, setHover] = useState<{ ci: number; x: number; y: number } | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();
  const padL = 40;
  const padB = 24;
  const padT = 8;
  const width = 600;
  const plotW = width - padL - 8;
  const plotH = height - padB - padT;
  const totals = categories.map((_, ci) => (stacked ? series.reduce((s, sr) => s + (sr.values[ci] ?? 0), 0) : Math.max(...series.map((sr) => sr.values[ci] ?? 0))));
  const max = Math.max(1, ...totals);
  const niceMax = niceCeil(max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const slot = plotW / Math.max(1, categories.length);
  const gap = 2;
  const barW = stacked ? Math.min(28, slot * 0.6) : Math.min(22, (slot * 0.7 - gap * (series.length - 1)) / series.length);
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  if (series.length === 0 || categories.length === 0) return <div className="py-8 text-center text-xs text-ink-3">No data</div>;

  return (
    <div className={clsx('relative', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
        {series.length > 1 &&
          series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              {s.name}
            </span>
          ))}
        <button type="button" className="ml-auto text-2xs font-semibold uppercase tracking-[0.08em] text-ink-3 hover:text-ink" onClick={() => setTable((t) => !t)}>
          {table ? 'Chart' : 'Table'}
        </button>
      </div>
      {table ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-[0.08em] text-ink-3">
              <th className="py-1 pr-2 font-semibold">Category</th>
              {series.map((s) => (
                <th key={s.name} className="py-1 pr-2 text-right font-semibold">{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, ci) => (
              <tr key={c} className="border-t border-line-2">
                <td className="py-1 pr-2 text-ink">{c}</td>
                {series.map((s) => (
                  <td key={s.name} className="py-1 pr-2 text-right font-mono text-ink-2">{fmt(s.values[ci] ?? 0, format)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            role="img"
            aria-labelledby={id}
            onMouseMove={(e) => {
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * width;
              const ci = Math.floor((px - padL) / slot);
              if (ci >= 0 && ci < categories.length) setHover({ ci, x: e.clientX - rect.left, y: e.clientY - rect.top });
              else setHover(null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <title id={id}>Column chart</title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">
                  {fmt(t, format)}
                </text>
              </g>
            ))}
            {categories.map((c, ci) => {
              const cx = padL + slot * ci + slot / 2;
              let acc = 0;
              return (
                <g key={c}>
                  <rect x={padL + slot * ci} y={padT} width={slot} height={plotH} fill="transparent" />
                  {series.map((s, si) => {
                    const v = s.values[ci] ?? 0;
                    if (stacked) {
                      const y0 = y(acc + v);
                      const h = Math.max(0, y(acc) - y0 - (acc > 0 ? gap : 0));
                      acc += v;
                      return <rect key={s.name} x={cx - barW / 2} y={y0} width={barW} height={h} rx={si === series.length - 1 ? 3 : 0} fill={SERIES[si % SERIES.length]} />;
                    }
                    const groupW = series.length * barW + (series.length - 1) * gap;
                    const x = cx - groupW / 2 + si * (barW + gap);
                    return <rect key={s.name} x={x} y={y(v)} width={barW} height={Math.max(0, plotH + padT - y(v))} rx={3} fill={SERIES[si % SERIES.length]} />;
                  })}
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">
                    {c.length > 12 ? c.slice(0, 11) + '…' : c}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover && (
            <Tip x={hover.x} y={hover.y}>
              <div className="mb-0.5 font-semibold">{categories[hover.ci]}</div>
              {series.map((s, si) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[si % SERIES.length] }} />
                    {s.name}
                  </span>
                  <span className="font-mono">{fmt(s.values[hover.ci] ?? 0, format)}</span>
                </div>
              ))}
            </Tip>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Line chart: change over time, one or more series, crosshair tooltip
// ---------------------------------------------------------------------------

export function LineChart({ labels, series, height = 180, format, className }: { labels: string[]; series: ColumnSeries[]; height?: number; format?: (n: number) => string; className?: string }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const id = useId();
  const padL = 40;
  const padB = 22;
  const padT = 8;
  const width = 600;
  const plotW = width - padL - 8;
  const plotH = height - padB - padT;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const niceMax = niceCeil(max);
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => padL + (i / n) * plotW;
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  if (labels.length === 0) return <div className="py-8 text-center text-xs text-ink-3">No data</div>;
  return (
    <div className={clsx('relative', className)}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-2">
          {series.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ background: SERIES[i % SERIES.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-labelledby={id}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round(((px - padL) / plotW) * n);
          if (i >= 0 && i <= n) setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHover(null)}
      >
        <title id={id}>Line chart</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--ink-3)" fontFamily="IBM Plex Mono, monospace">
              {fmt(t, format)}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          return <path key={s.name} d={d} fill="none" stroke={SERIES[si % SERIES.length]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={padT} y2={padT + plotH} stroke="var(--ink-3)" strokeDasharray="3 3" />}
        {hover && series.map((s, si) => <circle key={s.name} cx={x(hover.i)} cy={y(s.values[hover.i] ?? 0)} r={4} fill={SERIES[si % SERIES.length]} stroke="var(--surface)" strokeWidth={2} />)}
        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1 ? (
            <text key={l + i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--ink-3)">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      {hover && (
        <Tip x={hover.x} y={hover.y}>
          <div className="mb-0.5 font-semibold">{labels[hover.i]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-0.5 w-3 rounded" style={{ background: SERIES[si % SERIES.length] }} />
                {s.name}
              </span>
              <span className="font-mono">{fmt(s.values[hover.i] ?? 0, format)}</span>
            </div>
          ))}
        </Tip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut: part-to-whole with a centre headline, max 6 slices then "Other"
// ---------------------------------------------------------------------------

export function Donut({ data, size = 140, format, centre, className }: { data: Datum[]; size?: number; format?: (n: number) => string; centre?: ReactNode; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const slices = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const head = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, d) => s + d.value, 0);
    return [...head, { label: 'Other', value: rest }];
  }, [data]);
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 4;
  const stroke = 14;
  const c = 2 * Math.PI * (r - stroke / 2);
  let offset = 0;
  if (slices.length === 0) return <div className="py-8 text-center text-xs text-ink-3">No data</div>;
  return (
    <div className={clsx('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
          {slices.map((d, i) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r - stroke / 2}
                fill="none"
                stroke={SERIES[(d.series ?? i) % SERIES.length]}
                strokeWidth={hover === i ? stroke + 3 : stroke}
                strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2) + 2}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className="transition-[stroke-width] duration-150"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover !== null ? (
            <>
              <div className="font-mono text-lg font-semibold text-ink">{fmt(slices[hover]!.value, format)}</div>
              <div className="max-w-[80px] truncate text-2xs normal-case tracking-normal text-ink-3">{slices[hover]!.label}</div>
            </>
          ) : (
            centre ?? <div className="font-mono text-lg font-semibold text-ink">{fmt(total, format)}</div>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {slices.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SERIES[(d.series ?? i) % SERIES.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="font-mono text-ink">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented bar: composition across one dimension (time breakdown, pipeline mix)
// ---------------------------------------------------------------------------

export function SegmentedBar({ segments, height = 10, format, className }: { segments: Array<{ label: string; value: number; colour?: string; series?: number }>; height?: number; format?: (n: number) => string; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={className}>
      <div className="flex w-full overflow-hidden rounded bg-gray-soft" style={{ height, gap: 2 }}>
        {segments.map((s, i) =>
          s.value > 0 ? <div key={s.label} title={`${s.label}: ${fmt(s.value, format)}`} style={{ width: `${(s.value / total) * 100}%`, background: s.colour ?? SERIES[(s.series ?? i) % SERIES.length] }} /> : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {segments.map((s, i) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.colour ?? SERIES[(s.series ?? i) % SERIES.length] }} />
            {s.label} <span className="font-mono text-ink">{fmt(s.value, format)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}
