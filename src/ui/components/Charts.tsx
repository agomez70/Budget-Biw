import { useState } from 'react';

const W = 320;
const H = 140;
const PAD = { l: 8, r: 8, t: 10, b: 20 };
const innerW = W - PAD.l - PAD.r;
const innerH = H - PAD.t - PAD.b;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/** Single-series line with crosshair tooltip. Title outside names the series. */
export function LineChart({ points, format, ariaLabel }: { points: { label: string; value: number }[]; format: (v: number) => string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} className="grid" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + innerH * f} y2={PAD.t + innerH * f} />
        ))}
        <path d={`${d}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--chart-1)" opacity={0.12} />
        <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
            {points[i].label}
          </text>
        ))}
        {hover != null && (
          <>
            <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + innerH} />
            <circle cx={x(hover)} cy={y(points[hover].value)} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
          </>
        )}
        {points.map((_, i) => (
          <rect
            key={i}
            className="hit"
            x={x(i) - innerW / (points.length - 1) / 2}
            y={0}
            width={innerW / (points.length - 1)}
            height={H}
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          />
        ))}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          {points[hover].label}: <b>{format(points[hover].value)}</b>
        </div>
      )}
    </div>
  );
}

export interface BarRow {
  label: string;
  values: number[];
}

/** Grouped bars (1–2 series) with a legend and per-group hover tooltip. Negative values hang below the baseline. */
export function GroupedBars({ rows, series, format, ariaLabel }: { rows: BarRow[]; series: string[]; format: (v: number) => string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length === 0) return null;
  const all = rows.flatMap((r) => r.values);
  const max = niceMax(Math.max(0, ...all));
  const minRaw = Math.min(0, ...all);
  const min = minRaw < 0 ? -niceMax(-minRaw) : 0;
  const span = max - min || 1;
  const y = (v: number) => PAD.t + ((max - v) / span) * innerH;
  const groupW = innerW / rows.length;
  const gap = 2;
  const barW = Math.max(2, Math.min(18, (groupW - 6) / series.length - gap));
  const colors = ['var(--chart-1)', 'var(--chart-2)'];
  return (
    <div className="chart-wrap">
      {series.length > 1 && (
        <div className="legend mb">
          {series.map((s, i) => (
            <span key={s}>
              <i style={{ background: colors[i] }} />
              {s}
            </span>
          ))}
        </div>
      )}
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        {rows.map((r, gi) => {
          const cx = PAD.l + groupW * gi + groupW / 2;
          const totalW = series.length * barW + (series.length - 1) * gap;
          return (
            <g key={gi}>
              {r.values.map((v, si) => {
                const bx = cx - totalW / 2 + si * (barW + gap);
                const top = Math.min(y(v), y(0));
                const h = Math.max(1, Math.abs(y(v) - y(0)));
                const rad = Math.min(4, barW / 2, h);
                // rounded on the data end only
                const path =
                  v >= 0
                    ? `M${bx},${top + h}V${top + rad}Q${bx},${top} ${bx + rad},${top}H${bx + barW - rad}Q${bx + barW},${top} ${bx + barW},${top + rad}V${top + h}Z`
                    : `M${bx},${top}V${top + h - rad}Q${bx},${top + h} ${bx + rad},${top + h}H${bx + barW - rad}Q${bx + barW},${top + h} ${bx + barW},${top + h - rad}V${top}Z`;
                return <path key={si} d={path} fill={colors[si]} opacity={hover == null || hover === gi ? 1 : 0.45} />;
              })}
              {(rows.length <= 6 || gi % Math.ceil(rows.length / 6) === 0) && (
                <text x={cx} y={H - 5} textAnchor="middle">
                  {r.label}
                </text>
              )}
              <rect className="hit" x={PAD.l + groupW * gi} y={0} width={groupW} height={H} onMouseEnter={() => setHover(gi)} onTouchStart={() => setHover(gi)} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${Math.min(80, Math.max(20, ((PAD.l + groupW * hover + groupW / 2) / W) * 100))}%` }}>
          <div>{rows[hover].label}</div>
          {series.map((s, i) => (
            <div key={s}>
              {series.length > 1 && <i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colors[i], marginRight: 4 }} />}
              {s}: <b>{format(rows[hover].values[i])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
