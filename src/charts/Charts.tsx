/**
 * Chart.js wrappers. This file is only loaded with React.lazy, so Chart.js
 * stays out of the main bundle.
 */
import { useEffect, useRef } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
);

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface Series {
  label: string;
  data: (number | null)[];
  color?: string;
  stack?: string;
}

interface Props {
  type: 'line' | 'bar';
  labels: string[];
  series: Series[];
  ariaLabel: string;
  height?: number;
  stacked?: boolean;
  valueFormat?: (n: number) => string;
}

function ChartView({ type, labels, series, ariaLabel, height = 220, stacked, valueFormat }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const text = cssVar('--muted') || '#64748B';
    const grid = cssVar('--border') || '#E2E8F0';
    const primary = cssVar('--primary') || '#3B82F6';
    const config: ChartConfiguration = {
      type,
      data: {
        labels,
        datasets: series.map((s) => {
          const color = s.color || primary;
          return {
            label: s.label,
            data: s.data,
            borderColor: color,
            backgroundColor: type === 'line' ? `${color}1f` : color,
            fill: type === 'line' && series.length === 1,
            tension: 0.38,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#fff',
            borderWidth: 2,
            borderRadius: type === 'bar' ? 6 : undefined,
            maxBarThickness: 36,
            spanGaps: true,
            stack: s.stack,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: series.length > 1, labels: { color: text, boxWidth: 12 } },
          tooltip: valueFormat
            ? { callbacks: { label: (c) => `${c.dataset.label}: ${valueFormat(Number(c.raw))}` } }
            : {},
        },
        scales: {
          x: {
            stacked,
            ticks: { color: text, maxRotation: 0, autoSkip: true },
            grid: { display: false },
          },
          y: {
            stacked,
            beginAtZero: type === 'bar',
            ticks: { color: text },
            grid: { color: grid },
          },
        },
      },
    };
    const chart = new Chart(canvas.current, config);
    return () => chart.destroy();
  }, [type, labels, series, stacked, valueFormat]);

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export default ChartView;
