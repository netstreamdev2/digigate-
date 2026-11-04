"use server";

import type { IconName } from "@/components/icon";
import { addDays, shortDate, siteToday, timeOfDay } from "@/lib/format";
import { canWatchGates } from "@/lib/nav";
import { anyColumnLike, likePattern } from "@/lib/paging";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export type SearchHit = { group: string; label: string; detail: string; href: string; icon: IconName };

const EACH = 5;
const CHECK_DAYS = 30;
const SHORTEST = 2;

/**
 * What Ctrl+K finds, a few of each kind: companies, sites, who's inside now, the last month's checks, gate staff and
 * the hotlist. Row security decides what comes back, the same as every page, and nothing is searched until two letters
 * are typed. A kind that fails to read is left out and said so, rather than looking like no match.
 */
export async function quickSearch(term: string): Promise<{ hits: SearchHit[]; problem: string | null }> {
  const text = term.trim();
  if (text.length < SHORTEST) return { hits: [], problem: null };
  const user = await currentUser();
  if (!user) return { hits: [], problem: null };
  const isSuperUser = user.roles.includes("super_user");
  const isAdministrator = isSuperUser || user.roles.includes("admin");
  const pattern = likePattern(text);
  const now = Date.now();
  const since = `${addDays(siteToday(now), -CHECK_DAYS)}T00:00:00+02:00`;
  const supabase = await supabaseServer();

  const [companies, sites, inside, checks, staff, hotlist] = await Promise.all([
    isSuperUser ? supabase.from("organisations").select("id, name").ilike("name", pattern).order("name").limit(EACH) : null,
    supabase.from("sites").select("id, name, code, organisations(name)").or(anyColumnLike(["name", "code"], text)).order("name").limit(EACH),
    supabase.from("visit_records").select("id, site_id, person_name, plate, kind").is("exited_at", null).or(anyColumnLike(["person_name", "plate"], text)).limit(EACH),
    supabase
      .from("check_records")
      .select("id, site_id, person_name, plate, type, occurred_at")
      .gte("occurred_at", since)
      .or(anyColumnLike(["person_name", "plate", "typed_plate"], text))
      .order("occurred_at", { ascending: false })
      .limit(EACH),
    isAdministrator
      ? supabase.from("gate_users").select("id, org_id, first_name, last_name, employee_number, role").or(anyColumnLike(["first_name", "last_name", "employee_number"], text)).limit(EACH)
      : null,
    canWatchGates(user) ? supabase.from("hotlist").select("id, label, kind").is("removed_at", null).ilike("label", pattern).limit(EACH) : null,
  ]);

  const failed = [companies, sites, inside, checks, staff, hotlist].some((read) => read?.error);
  const siteIds = [...new Set([...(inside?.data ?? []), ...(checks?.data ?? [])].flatMap((row) => (row.site_id ? [row.site_id] : [])))];
  const names = siteIds.length ? await supabase.from("sites").select("id, name").in("id", siteIds) : null;
  const siteName = new Map((names?.data ?? []).map((site) => [site.id, site.name]));
  const query = encodeURIComponent(text);

  const hits: SearchHit[] = [
    ...(companies?.data ?? []).map((company) => ({ group: "Companies", label: company.name, detail: "Go into the company", href: `/setup/${company.id}`, icon: "sites" as const })),
    ...(sites?.data ?? []).map((site) => ({
      group: "Sites",
      label: [site.name, site.code].filter(Boolean).join(" · "),
      detail: site.organisations?.name ?? "Control room",
      href: `/control-room/${site.id}`,
      icon: "on-site" as const,
    })),
    // In an emergency, typing the site's name is the fastest way to its roll call.
    ...(sites?.data ?? []).map((site) => ({
      group: "Evacuation lists",
      label: `Evacuation list · ${site.name}`,
      detail: "Everyone inside now, to tick off and print",
      href: `/control-room/${site.id}/evacuation`,
      icon: "evacuation" as const,
    })),
    ...(inside?.data ?? []).flatMap((visit) =>
      visit.site_id && visit.id
        ? [{
            group: "On site now",
            label: visit.person_name ?? visit.plate ?? "Someone inside",
            detail: [visit.plate, siteName.get(visit.site_id)].filter(Boolean).join(" · "),
            href: `/control-room/${visit.site_id}?q=${query}${visit.kind === "pedestrian" ? "&lane=pedestrian" : ""}`,
            icon: (visit.kind === "pedestrian" ? "pedestrian" : "vehicle") as IconName,
          }]
        : [],
    ),
    ...(checks?.data ?? []).flatMap((check) =>
      check.occurred_at
        ? [{
            group: "Checks this month",
            label: check.person_name ?? check.plate ?? "A check",
            detail: [`${check.type?.endsWith("_entry") ? "In" : "Out"} ${shortDate(check.occurred_at)}, ${timeOfDay(check.occurred_at)}`, check.site_id ? siteName.get(check.site_id) : null]
              .filter(Boolean)
              .join(" · "),
            href: `/checks?q=${query}&from=${addDays(siteToday(now), -CHECK_DAYS)}`,
            icon: "visits" as const,
          }]
        : [],
    ),
    ...(staff?.data ?? []).map((person) => ({
      group: "Gate staff",
      label: `${person.first_name} ${person.last_name}`,
      detail: `${person.role === "supervisor" ? "Supervisor" : "Guard"} · ${person.employee_number}`,
      href: `/admin/${person.org_id}/guards/${person.id}`,
      icon: "guard" as const,
    })),
    ...(hotlist?.data ?? []).map((entry) => ({ group: "Hotlist", label: entry.label, detail: "On the hotlist", href: `/hotlist?q=${encodeURIComponent(entry.label)}`, icon: "watchlist" as const })),
  ];
  return { hits, problem: failed ? "Part of the search didn't load. What's shown may not be everything." : null };
}
