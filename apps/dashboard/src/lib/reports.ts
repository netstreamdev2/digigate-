import "server-only";

import { percentChange, priorLabel, type ReportData, type ReportFrequency } from "@digigate/core";

import type { Trend } from "@/components/glass";

import { brandOf, type CompanyBrand } from "./company-brand";
import { likePattern } from "./paging";
import { must } from "./reads";
import { supabaseServer } from "./supabase/server";

/** Three to a row, so the last row of cards is never left with a gap. */
export const BOARD_PAGE_SIZE = 24;

const SENDS_SHOWN = 10;
const MOST_CLIENTS = 500;

export type CompanyDay = {
  id: string;
  company: string;
  sites: number;
  activeSites: number;
  checks: number;
  entries: number;
  exits: number;
  blocked: number;
  warnings: number;
  overrides: number;
  trend: readonly number[];
  brand: CompanyBrand;
};

export type DayTotals = { checks: number; entries: number; blocked: number; warnings: number; companies: number };

export type ReportSchedule = {
  id: string;
  name: string;
  frequency: string;
  sendAt: string;
  recipients: number;
  isActive: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  client: string | null;
};

export type ReportSend = {
  id: string;
  subject: string;
  recipients: number;
  sentAt: string;
  failed: boolean;
  automatic: boolean;
};

export async function reportBoard(day: string, search: string, page: number): Promise<{ companies: CompanyDay[]; total: number }> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("report_board", { _day: day, _search: search ? likePattern(search) : "", _limit: BOARD_PAGE_SIZE, _offset: (page - 1) * BOARD_PAGE_SIZE }));
  // Each card wears its company's logo: one read for the page of companies shown, never one per card.
  const looks = rows.length
    ? must(await supabase.from("organisations").select("id, name, logo_path, brand_color").in("id", rows.map((row) => row.org_id)))
    : [];
  const brands = new Map(looks.map((look) => [look.id, brandOf(look)]));
  return {
    total: rows[0]?.total ?? 0,
    companies: rows.map((row) => ({
      brand: brands.get(row.org_id) ?? { id: row.org_id, name: row.company, logoUrl: null, color: null },
      id: row.org_id,
      company: row.company,
      sites: row.sites,
      activeSites: row.active_sites,
      checks: row.checks,
      entries: row.entries,
      exits: row.exits,
      blocked: row.blocked,
      warnings: row.warnings,
      overrides: row.overrides,
      trend: row.trend,
    })),
  };
}

const NO_TOTALS: DayTotals = { checks: 0, entries: 0, blocked: 0, warnings: 0, companies: 0 };

/** The chosen day first, then the day before it to compare with. */
export async function dayTotals(day: string): Promise<{ today: DayTotals; before: DayTotals }> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("report_day_totals", { _day: day }));
  return { today: rows.find((row) => row.day === day) ?? NO_TOTALS, before: rows.find((row) => row.day !== day) ?? NO_TOTALS };
}

/** Null when this company isn't theirs. */
export async function reportSummary(org: string, frequency: ReportFrequency, day: string, client: string): Promise<ReportData | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("report_summary", { _org: org, _frequency: frequency, _day: day, ...(client ? { _client: client } : {}) });
  if (error) throw new Error("A read failed.");
  // The shape is set by digigate.report_data, which the database tests hold to it.
  return data as unknown as ReportData | null;
}

export async function companyClients(org: string): Promise<{ id: string; name: string }[]> {
  const supabase = await supabaseServer();
  return must(await supabase.from("clients").select("id, name").eq("org_id", org).order("name").limit(MOST_CLIENTS));
}

/** An address that gets, or could get, the Security Checks report, and whether its PDF password is set. */
export type PdfPasswordLine = { email: string; setAt: string | null; onSchedule: boolean };

/**
 * Everyone a Security Checks schedule sends to, and everyone with a PDF password, in one list. The passwords themselves
 * never leave digigate-reports.
 */
export async function pdfPasswordLines(org: string): Promise<PdfPasswordLine[]> {
  const supabase = await supabaseServer();
  const [schedules, status] = await Promise.all([
    supabase.from("report_schedules").select("recipients, cc, bcc").eq("org_id", org).eq("security_checks", true),
    supabase.rpc("report_pdf_password_status", { _org: org }),
  ]);
  const scheduled = new Set(must(schedules).flatMap((row) => [...row.recipients, ...row.cc, ...row.bcc].map((email) => email.toLowerCase())));
  const setAt = new Map(must(status).map((row) => [row.email, row.set_at]));
  return [...new Set([...scheduled, ...setAt.keys()])]
    .sort()
    .map((email) => ({ email, setAt: setAt.get(email) ?? null, onSchedule: scheduled.has(email) }));
}

export async function reportSchedules(org: string): Promise<ReportSchedule[]> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase
      .from("report_schedules")
      .select("id, name, frequency, send_at, recipients, cc, bcc, is_active, next_run_at, last_run_at, clients(name)")
      .eq("org_id", org)
      .order("created_at", { ascending: false }),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    sendAt: row.send_at.slice(0, 5),
    recipients: row.recipients.length + row.cc.length + row.bcc.length,
    isActive: row.is_active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    client: row.clients?.name ?? null,
  }));
}

export async function reportSends(org: string): Promise<ReportSend[]> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase
      .from("report_sends")
      .select("id, subject, recipients, cc, bcc, sent_at, status, schedule_id")
      .eq("org_id", org)
      .order("sent_at", { ascending: false })
      .limit(SENDS_SHOWN),
  );
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    recipients: row.recipients.length + row.cc.length + row.bcc.length,
    sentAt: row.sent_at,
    failed: row.status === "failed",
    automatic: row.schedule_id !== null,
  }));
}

type UpMeans = "good" | "bad" | "neutral";

/** How a figure moved, in words. `against` names what it's compared with. */
export function trendFor(now: number, before: number, against: string, upMeans: UpMeans = "neutral"): Trend {
  const change = percentChange(now, before);
  if (change === null) return { text: "Nothing to compare with", direction: "flat", feeling: "neutral" };
  if (change === 0) return { text: `No change on ${against}`, direction: "flat", feeling: "neutral" };
  const up = change > 0;
  return {
    text: `${Math.abs(change)}% ${up ? "up" : "down"} on ${against}`,
    direction: up ? "up" : "down",
    feeling: upMeans === "neutral" ? "neutral" : up === (upMeans === "good") ? "good" : "bad",
  };
}

export const againstPrior = (frequency: ReportFrequency) => priorLabel(frequency);
