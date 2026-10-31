/** How many rows a list ever asks the database for at once. */
export const PAGE_SIZE = 25;

export type Query = Record<string, string | string[] | undefined>;

export function textParam(query: Query, name: string): string {
  const value = query[name];
  return typeof value === "string" ? value.trim() : "";
}

export function pageParam(query: Query): number {
  const page = Number(textParam(query, "page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** The first and last row of a page, as the database counts them. */
export function rangeOf(page: number): [number, number] {
  return [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];
}

/** A search term for a "contains" match. Its own wildcards are escaped, so typing % finds a percent sign. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** A search across several columns at once. Commas and brackets would change the filter's meaning, so they go. */
export function anyColumnLike(columns: readonly string[], text: string): string {
  const pattern = likePattern(text.replace(/[,()]/g, " "));
  return columns.map((column) => `${column}.ilike.${pattern}`).join(",");
}

/** The same address with a different page, keeping the search and filters. */
export function pageHref(path: string, query: Query, page: number): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === "string" && value && name !== "page") params.set(name, value);
  }
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
