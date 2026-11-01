'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

type ChartDataPoint = { time: string; value: number };

export function TradingViewChart({ data, title }: { data: ChartDataPoint[]; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data.length) return;
    const css = getComputedStyle(container);
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css.getPropertyValue('--muted').trim(), fontFamily: 'inherit' },
      grid: { vertLines: { visible: false }, horzLines: { color: css.getPropertyValue('--border').trim() } },
      width: container.clientWidth, height: 280,
      timeScale: { borderVisible: false }, rightPriceScale: { borderVisible: false },
    });
    const series = chart.addLineSeries({ color: css.getPropertyValue('--chart-color').trim(), lineWidth: 2, priceLineVisible: false, crosshairMarkerRadius: 4 });
    series.setData(data);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove(event => {
      const point = event.seriesData.get(series);
      if (tooltipRef.current) tooltipRef.current.textContent = event.time && point && 'value' in point ? `${event.time}: ${point.value.toLocaleString()}` : 'Move over the chart to inspect a value, or open the data table.';
    });
    const resize = new ResizeObserver(() => chart.resize(container.clientWidth, 280));
    resize.observe(container);
    const theme = new MutationObserver(() => {
      const current = getComputedStyle(container);
      chart.applyOptions({ layout: { textColor: current.getPropertyValue('--muted').trim() }, grid: { horzLines: { color: current.getPropertyValue('--border').trim() } } });
      series.applyOptions({ color: current.getPropertyValue('--chart-color').trim() });
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const system = matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const current = getComputedStyle(container);
      chart.applyOptions({ layout: { textColor: current.getPropertyValue('--muted').trim() }, grid: { horzLines: { color: current.getPropertyValue('--border').trim() } } });
      series.applyOptions({ color: current.getPropertyValue('--chart-color').trim() });
    };
    system.addEventListener('change', update);
    return () => { system.removeEventListener('change', update); theme.disconnect(); resize.disconnect(); chart.remove(); };
  }, [data]);

  return <section className="card min-w-0 p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2>{!data.length ? <p className="text-[var(--muted)]">No activity recorded.</p> : <><div ref={containerRef} aria-label={`${title} line chart`} role="img" /><p ref={tooltipRef} className="mt-3 min-h-11 text-[var(--muted)]">Move over the chart to inspect a value, or open the data table.</p><details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center underline">View data table</summary><div className="max-h-72 overflow-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Date</th><th className="p-2 text-right">Value</th></tr></thead><tbody>{data.map(point => <tr key={point.time}><td className="p-2">{point.time}</td><td className="p-2 text-right tabular-nums">{point.value.toLocaleString()}</td></tr>)}</tbody></table></div></details></>}</section>;
}
