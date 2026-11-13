import type { CurrentUser } from "./session";

type Roles = Pick<CurrentUser, "roles">;

/** DigiGate's own staff work across companies. Commercial controls remain super-user only. */
export const isDigiGateStaff = (user: Roles) => user.roles.some((role) => role === "super_user" || role === "technician");
export const canAdminister = (user: Roles) => isDigiGateStaff(user) || user.roles.includes("admin");
