"use client";

function LaneChoice({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex h-11 flex-1 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium has-checked:border-ink has-checked:bg-tile-sky">
      <input type="checkbox" name="lanes" value={value} defaultChecked className="accent-ink" />
      {label}
    </label>
  );
}

export function LaneChoices() {
  return (
    <div className="flex gap-2">
      <LaneChoice value="vehicle" label="Cars" />
      <LaneChoice value="pedestrian" label="On foot" />
    </div>
  );
}
