'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

type ChartDataPoint = {
  time: string;
  value: number;
};

export function TradingViewChart({
  data,
  title,
  color = '#6366f1',
}: {
  data: ChartDataPoint[];
  title: string;
  color?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const container = containerRef.current;

    // Create TradingView lightweight chart instance
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontFamily: 'inherit',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(99, 102, 241, 0.2)',
          labelBackgroundColor: '#18181b',
        },
        horzLine: {
          color: 'rgba(99, 102, 241, 0.2)',
          labelBackgroundColor: '#18181b',
        },
      },
      width: container.clientWidth,
      height: 300,
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
    });

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 2,
    });

    series.setData(data);
    chart.timeScale().fitContent();

    const handleResize = () => {
      chart.applyOptions({ width: container.clientWidth });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, color]);

  return (
    <div className="card border border-[var(--border)] bg-[var(--panel)] p-6">
      <h3 className="text-sm font-bold tracking-tight text-[var(--text)] mb-4">{title}</h3>
      <div ref={containerRef} className="w-full" style={{ minHeight: '300px' }} />
    </div>
  );
}
