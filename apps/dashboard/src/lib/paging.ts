import { vehicleSearchTerms } from "@digigate/core";

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

/**
 * A search where every word must match, in any of the columns, the way people describe what they want: "white
 * hatchback", "blue Mercedes", "Khumalo CA". Each word also matches what a licence disc calls the same thing (SUV finds
 * "Station wagon"). One filter per word, for the query to apply each with `.or()`, so together they all must hold.
 */
export function everyWordLike(columns: readonly string[], text: string): string[] {
  return vehicleSearchTerms(text.replace(/[,()]/g, " ")).map((alternatives) =>
    columns.flatMap((column) => alternatives.map((alternative) => `${column}.ilike.${likePattern(alternative)}`)).join(","),
  );
}

/** A query narrowed to rows where every word of the search matches (see everyWordLike). */
export function withEveryWord<Query extends { or: (filters: string) => Query }>(query: Query, columns: readonly string[], text: string): Query {
  return everyWordLike(columns, text).reduce((narrowed, filter) => narrowed.or(filter), query);
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
