/** Says which read failed by its code alone, such as PGRST201 or 57014: a database's own message can carry values. */
function readFailed(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? ` (${error.code})` : "";
  return new Error(`A read failed${code}.`);
}

/** A failed read must never look like an empty result, so it stops the page instead. */
export function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error || result.data === null) throw readFailed(result.error);
  return result.data;
}

/** For a read that can rightly find nothing: null means it isn't there, and a failure still stops the page. */
export function maybe<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw readFailed(result.error);
  return result.data;
}

export function counted(result: { count: number | null; error: unknown }): number {
  if (result.error) throw readFailed(result.error);
  return result.count ?? 0;
}

/** When a page's data was read: the moment its "updated" time and its durations are measured from. */
export const readClock = () => Date.now();
