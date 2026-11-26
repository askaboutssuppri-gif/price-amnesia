import React from 'react';
import type { PriceEntry } from '../lib/store';
import { money } from '../lib/store';

// Small inline sparkline (SVG polyline) for item rows.
export function Sparkline({ history, width = 74, height = 26 }: { history: PriceEntry[]; width?: number; height?: number }) {
  if (history.length < 2) {
    return <div className="spark-empty" style={{ width, height }}>—</div>;
  }
  const prices = history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * (width - 6) + 3;
    const y = height - 4 - ((p - min) / span) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  const rising = prices[prices.length - 1] >= prices[0];
  return (
    <svg width={width} height={height} className="spark">
      <polyline points={pts} fill="none" stroke={rising ? '#ff5d8f' : '#2dffb3'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Big animated trend chart for the item detail view.
export function TrendChart({ history }: { history: PriceEntry[] }) {
  const W = 320, H = 150, PAD = 18;
  if (history.length === 0) return null;
  if (history.length === 1) {
    return (
      <div className="chart-single">
        <div className="chart-single-dot" />
        <p>One sighting so far — <strong>{money(history[0].price)}</strong> at {history[0].store}. Scan it again and I'll draw you the trend.</p>
      </div>
    );
  }
  const prices = history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const pts = history.map((h, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((h.price - lo) / (hi - lo)) * (H - PAD * 2);
    return { x, y, h };
  });
  const line = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const last = pts[pts.length - 1];
  const rising = prices[prices.length - 1] >= prices[0];
  const stroke = rising ? '#ff5d8f' : '#2dffb3';
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#chartFill)" />
        <polyline points={line} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 3.5} fill="#0a0f22" stroke={stroke} strokeWidth="2" />
        ))}
        <circle cx={last.x} cy={last.y} r="10" fill="none" stroke={stroke} strokeWidth="1" className="chart-pulse" />
        <text x={PAD} y={14} className="chart-label">high {money(max)}</text>
        <text x={PAD} y={H - 4} className="chart-label">low {money(min)}</text>
      </svg>
    </div>
  );
}
