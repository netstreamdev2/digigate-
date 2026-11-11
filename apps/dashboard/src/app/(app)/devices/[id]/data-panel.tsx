"use client";

import { useState } from "react";

import { DataColumns, type DataColumn } from "@/components/report-charts";
import { Segmented } from "@/components/segmented";

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
];

/** Mobile data by day, with a switch for how far back; the bars grow in again each time it changes. */
export function DataPanel({ days, caption }: { days: readonly DataColumn[]; caption: string }) {
  const [period, setPeriod] = useState("30");
  const shown = days.slice(-Number(period));
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Segmented label="How far back" options={PERIODS} value={period} onChange={setPeriod} />
      </div>
      <DataColumns key={period} days={shown} caption={caption} />
    </>
  );
}
