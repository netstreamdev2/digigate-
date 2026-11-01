/** A failed read must never look like an empty result, so it stops the page instead. */
export function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) throw new Error("A read failed.");
  return result.data;
}

export function counted(result: { count: number | null; error: unknown }): number {
  if (result.error) throw new Error("A read failed.");
  return result.count ?? 0;
}

/** When a page's data was read: the moment its "updated" time and its durations are measured from. */
export const readClock = () => Date.now();
