import { Icon } from "./icon";

/** Says the thing just added is there, and what comes next, so adding never ends in silence. */
export function AddedNotice({ title, next }: { title: string; next: string }) {
  return (
    <div role="status" className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-clear-soft px-5 py-4">
      <Icon name="result-clear" className="mt-0.5 size-5 shrink-0 text-clear" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-ink-muted">{next}</p>
      </div>
    </div>
  );
}
