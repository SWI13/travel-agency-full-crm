import { registerLicense } from "@syncfusion/ej2-base";
import {
  Category,
  ChartComponent,
  ColumnSeries,
  Inject,
  SeriesCollectionDirective,
  SeriesDirective,
  Tooltip,
} from "@syncfusion/ej2-react-charts";
import type { SeriesPoint } from "./charts";

/**
 * Syncfusion version of the leads-over-time chart. Loaded only when
 * VITE_SYNCFUSION_LICENSE_KEY is set (Syncfusion shows a trial banner otherwise).
 */
const licence = import.meta.env.VITE_SYNCFUSION_LICENSE_KEY as string | undefined;
if (licence) registerLicense(licence);

export default function SyncfusionColumnChart({ data, seriesName, isRtl }: { data: SeriesPoint[]; seriesName: string; isRtl: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div dir="ltr">
      <ChartComponent
        id="leads-over-time"
        height="300px"
        enableRtl={isRtl}
        background="transparent"
        chartArea={{ border: { width: 0 } }}
        primaryXAxis={{ valueType: "Category", majorGridLines: { width: 0 }, majorTickLines: { width: 0 }, lineStyle: { color: "#e8e0d1" }, labelStyle: { color: "#6b7c9b", size: "11px" }, labelIntersectAction: "Hide" }}
        primaryYAxis={{ minimum: 0, interval: Math.max(1, Math.ceil(max / 4)), labelFormat: "{value}", lineStyle: { width: 0 }, majorTickLines: { width: 0 }, majorGridLines: { color: "#f3eee4" }, labelStyle: { color: "#6b7c9b", size: "11px" } }}
        tooltip={{ enable: true, header: "", format: "${point.x} : <b>${point.y}</b>" }}
      >
        <Inject services={[ColumnSeries, Category, Tooltip]} />
        <SeriesCollectionDirective>
          {/* one hue: this chart shows magnitude over time, not categories */}
          <SeriesDirective dataSource={data} xName="label" yName="count" type="Column" name={seriesName} fill="#059669" columnWidth={0.55} cornerRadius={{ topLeft: 4, topRight: 4 }} />
        </SeriesCollectionDirective>
      </ChartComponent>
    </div>
  );
}
