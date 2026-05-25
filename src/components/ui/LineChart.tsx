import { useId } from "react";

export interface LinePoint { label: string; value: number; }

/**
 * Lightweight SVG line chart (no dependency). Plots `points` left→right with a
 * soft area fill, dots, and sparse x-axis labels. `yMax` defaults to the data max.
 */
export function LineChart({
  points, yMax, height = 160, color = "var(--primary)", suffix = "", valueFormat,
}: {
  points: LinePoint[]; yMax?: number; height?: number; color?: string; suffix?: string;
  valueFormat?: (v: number) => string;
}) {
  const gradId = useId().replace(/:/g, "");
  if (points.length === 0) return <div className="empty">Nog geen gegevens voor een grafiek.</div>;

  const W = 600, H = height, padL = 34, padR = 12, padT = 14, padB = 24;
  const max = yMax ?? Math.max(1, ...points.map((p) => p.value));
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (Math.min(v, max) / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const fmt = valueFormat ?? ((v: number) => Math.round(v) + suffix);
  const ticks = [0, 0.5, 1].map((t) => ({ v: max * t, yy: y(max * t) }));
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.yy} x2={W - padR} y2={t.yy} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? "" : "3 4"} />
          <text x={padL - 6} y={t.yy + 3} textAnchor="end" fontSize="9" fill="var(--fg-subtle)" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(t.v)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3" fill="var(--bg-elev)" stroke={color} strokeWidth="2">
            <title>{`${p.label}: ${fmt(p.value)}`}</title>
          </circle>
          {i % step === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--fg-subtle)">{p.label}</text>}
        </g>
      ))}
    </svg>
  );
}
