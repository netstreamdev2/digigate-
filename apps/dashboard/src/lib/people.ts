import "server-only";

import { likePattern, PAGE_SIZE, rangeOf } from "./paging";
import { must } from "./reads";
import { supabaseServer } from "./supabase/server";

export type Login = {
  id: string;
  name: string;
  login: string;
  role: string;
  isActive: boolean;
  addedAt: string;
  sites: number;
  company: string | null;
  client: string | null;
};

export type GateStaffMember = {
  id: string;
  name: string;
  employeeNumber: string;
  role: string;
  isActive: boolean;
  sites: number;
  company: string;
  onDutyAt: string | null;
};

export type PeopleFilter = {
  search: string;
  role: string;
  /** `active`, `inactive`, or empty for both. */
  status: string;
  newest: boolean;
  company: string;
};

export type RoleCounts = {
  byRole: Readonly<Record<string, number>>;
  total: number;
  active: number;
  deactivated: number;
  onDuty: number;
};

const pattern = (search: string) => (search ? likePattern(search) : "");
const companyArgument = (company: string) => (company ? { _org: company } : {});

function summed(rows: readonly { role: string; is_active: boolean; people: number; on_duty?: number }[]): RoleCounts {
  const byRole: Record<string, number> = {};
  let active = 0;
  let deactivated = 0;
  let onDuty = 0;
  for (const row of rows) {
    byRole[row.role] = (byRole[row.role] ?? 0) + row.people;
    if (row.is_active) active += row.people;
    else deactivated += row.people;
    onDuty += row.on_duty ?? 0;
  }
  return { byRole, total: active + deactivated, active, deactivated, onDuty };
}

export async function loginBoard({ search, role, status, newest, company }: PeopleFilter, page: number): Promise<{ people: Login[]; total: number }> {
  const supabase = await supabaseServer();
  const [from] = rangeOf(page);
  const rows = must(
    await supabase.rpc("people_board", { _search: pattern(search), _role: role, _status: status, _newest: newest, _limit: PAGE_SIZE, _offset: from, ...companyArgument(company) }),
  );
  return {
    total: rows[0]?.total ?? 0,
    people: rows.map((row) => ({
      id: row.id,
      name: row.full_name,
      login: row.login,
      role: row.role,
      isActive: row.is_active,
      addedAt: row.created_at,
      sites: row.site_count,
      company: row.company,
      client: row.client,
    })),
  };
}

export async function loginCounts(search: string, company: string): Promise<RoleCounts> {
  const supabase = await supabaseServer();
  return summed(must(await supabase.rpc("people_counts", { _search: pattern(search), ...companyArgument(company) })));
}

export async function gateStaffBoard({ search, role, status, newest, company }: PeopleFilter, page: number): Promise<{ people: GateStaffMember[]; total: number }> {
  const supabase = await supabaseServer();
  const [from] = rangeOf(page);
  const rows = must(
    await supabase.rpc("gate_staff_board", { _search: pattern(search), _role: role, _status: status, _newest: newest, _limit: PAGE_SIZE, _offset: from, ...companyArgument(company) }),
  );
  return {
    total: rows[0]?.total ?? 0,
    people: rows.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      employeeNumber: row.employee_number,
      role: row.role,
      isActive: row.is_active,
      sites: row.site_count,
      company: row.company,
      onDutyAt: row.on_duty_at,
    })),
  };
}

export async function gateStaffCounts(search: string, company: string): Promise<RoleCounts> {
  const supabase = await supabaseServer();
  return summed(must(await supabase.rpc("gate_staff_counts", { _search: pattern(search), ...companyArgument(company) })));
}
