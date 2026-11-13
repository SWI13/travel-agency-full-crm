import { cn } from "~/lib/format";

export interface SeriesPoint {
  key: string;
  label: string;
  count: number;
}

/**
 * Column chart for a single series over time. Used when no Syncfusion licence
 * key is configured, so the dashboard never shows a trial banner.
 * One hue (magnitude, not categories), thin columns with rounded tops, recessive
 * grid, a tooltip per column and sparse axis labels.
 */
export function ColumnChart({ data, seriesName, height = 300 }: { data: SeriesPoint[]; seriesName: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const ticks = [4, 3, 2, 1, 0].map((n) => n * step);
  const every = Math.max(1, Math.ceil(data.length / 9));

  return (
    <figure className="relative" style={{ height }} role="img" aria-label={`${seriesName}: ${data.reduce((sum, d) => sum + d.count, 0)}`}>
      <div className="absolute inset-0 bottom-7 start-9">
        {ticks.map((tick) => (
          <div key={tick} className="absolute inset-x-0 border-t border-sand-200" style={{ bottom: `${(tick / top) * 100}%` }}>
            <span className="absolute -top-2 -start-9 w-7 text-end text-[11px] tabular muted">{tick}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
          {data.map((point, index) => (
            <div key={point.key} className="group relative flex-1 h-full flex items-end justify-center min-w-0">
              {/* full-height hit area so short columns are still easy to hover */}
              <div
                className={cn("w-full max-w-7 rounded-t-[4px] bg-emerald-600 transition-opacity group-hover:opacity-80", point.count === 0 && "bg-transparent")}
                style={{ height: `${(point.count / top) * 100}%` }}
              />
              <div className="pointer-events-none absolute bottom-full mb-1 z-10 hidden group-hover:block whitespace-nowrap rounded-lg bg-navy-900 px-2.5 py-1.5 text-xs text-white shadow-lift">
                {point.label} · <b className="tabular">{point.count}</b> {seriesName.toLowerCase()}
              </div>
              {index % every === 0 && (
                <span className="absolute top-full mt-2 text-[11px] muted whitespace-nowrap">{point.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
