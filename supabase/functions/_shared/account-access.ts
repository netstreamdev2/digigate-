type Account = { roles: readonly string[]; org_id: string | null };

export const isSuper = (caller: Account) => caller.roles.includes('super_user');
export const isStaff = (caller: Account) => isSuper(caller) || caller.roles.includes('technician');

export function canManage(caller: Account, orgId: string | null): boolean {
  return isStaff(caller) || (caller.roles.includes('admin') && orgId !== null && caller.org_id === orgId);
}

/** Technicians cannot administer a peer's global account. Only super users appoint or manage technicians. */
export function canManagePerson(caller: Account, target: Account): boolean {
  if (target.roles.includes('super_user')) return false;
  if (target.roles.includes('technician')) return isSuper(caller);
  return canManage(caller, target.org_id);
}

export const canCreateRole = (caller: Account, role: string) => role !== 'super_user' && (role !== 'technician' || isSuper(caller));
