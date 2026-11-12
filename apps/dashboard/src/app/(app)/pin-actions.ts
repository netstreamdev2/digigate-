"use server";

import { canWatchGates } from "@/lib/nav";
import { freshPin, hashPin } from "@/lib/pin-record";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

/*
 * A guard who forgot their PIN gets a new one from a company's admin, manager or control room, or a super user. The
 * database decides who may (reset_gate_user_pin); these only make the PIN, hash it, and hand it back once to be given
 * to the guard. It's never stored or shown anywhere else.
 */

export type StaffMatch = { id: string; name: string; employeeNumber: string; role: "guard" | "supervisor"; company: string };

export type PinResetResult = { ok: true; name: string; pin: string } | { ok: false; problem: string };

const SEARCH_MIN = 2;

export async function findStaffForPin(search: string): Promise<{ staff: StaffMatch[]; problem: string | null }> {
  const user = await currentUser();
  if (!user || !canWatchGates(user)) return { staff: [], problem: "Your account can't reset PINs." };
  if (search.trim().length < SEARCH_MIN) return { staff: [], problem: null };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("find_gate_staff", { _search: search.trim() });
  if (error) return { staff: [], problem: "Couldn't search just now. Try again." };
  return {
    staff: data.map((row) => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      employeeNumber: row.employee_number,
      role: row.role === "supervisor" ? "supervisor" : "guard",
      company: row.company,
    })),
    problem: null,
  };
}

export async function resetGatePin(gateUserId: string, name: string): Promise<PinResetResult> {
  const user = await currentUser();
  if (!user || !canWatchGates(user)) return { ok: false, problem: "Your account can't reset PINs." };
  const pin = freshPin();
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("reset_gate_user_pin", { _gate_user: gateUserId, _pin: hashPin(pin) });
  if (error) {
    return { ok: false, problem: error.code === "42501" ? "You can't reset this person's PIN." : "The PIN wasn't changed. Try again." };
  }
  return { ok: true, name, pin };
}
