// The daily Security Checks report: one line per gate check, and the summary at its top, laid out as the client's old
// system laid it out, so their managers read it the same way (13 November).

export type CheckTask = 'vehicle_entry' | 'vehicle_exit' | 'pedestrian_entry' | 'pedestrian_exit';

export const CHECK_TASKS: readonly CheckTask[] = ['vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit'];

export const TASK_LABELS: Readonly<Record<CheckTask, string>> = {
  vehicle_entry: 'Enter vehicle',
  vehicle_exit: 'Exit vehicle',
  pedestrian_entry: 'Enter on foot',
  pedestrian_exit: 'Exit on foot',
};

export const isCheckTask = (value: unknown): value is CheckTask => typeof value === 'string' && (CHECK_TASKS as readonly string[]).includes(value);

/** What the summary needs from a check. `personRef` is the same for the same person and never shows who they are. */
export type SheetLine = {
  task: CheckTask;
  visitType: string | null;
  personRef: string | null;
  /** Everyone in the car, driver included, as the handheld counts them; nothing for someone on foot. */
  occupants: number | null;
};

/** Passengers are everyone in the car but the driver. Someone on foot has none. */
export function passengersOf({ task, occupants }: Pick<SheetLine, 'task' | 'occupants'>): number {
  if (task === 'pedestrian_entry' || task === 'pedestrian_exit') return 0;
  return occupants !== null && Number.isFinite(occupants) ? Math.max(0, Math.floor(occupants) - 1) : 0;
}

export type TaskSummary = { task: CheckTask; transactions: number; people: number; passengers: number };
export type TypeSummary = { type: string | null; people: number; transactions: number };
export type SheetSummary = {
  /** Each person counted once, however often they came through. */
  people: number;
  transactions: number;
  passengers: number;
  /** Busiest first, tasks with no checks left out. */
  byTask: TaskSummary[];
  /** Busiest first; checks with no visit type are grouped last, as "(no type)". */
  byType: TypeSummary[];
};

function distinct(lines: readonly SheetLine[]): number {
  return new Set(lines.flatMap((line) => (line.personRef ? [line.personRef] : []))).size;
}

export function sheetSummary(lines: readonly SheetLine[]): SheetSummary {
  const byTask = CHECK_TASKS.map((task) => {
    const mine = lines.filter((line) => line.task === task);
    return { task, transactions: mine.length, people: distinct(mine), passengers: mine.reduce((sum, line) => sum + passengersOf(line), 0) };
  })
    .filter((row) => row.transactions > 0)
    .sort((a, b) => b.transactions - a.transactions);

  const types = new Map<string | null, SheetLine[]>();
  for (const line of lines) {
    const type = line.visitType?.trim() || null;
    types.set(type, [...(types.get(type) ?? []), line]);
  }
  const byType = [...types.entries()]
    .map(([type, mine]) => ({ type, people: distinct(mine), transactions: mine.length }))
    .sort((a, b) => (a.type === null ? 1 : b.type === null ? -1 : b.transactions - a.transactions || a.type.localeCompare(b.type)));

  return {
    people: distinct(lines),
    transactions: lines.length,
    passengers: lines.reduce((sum, line) => sum + passengersOf(line), 0),
    byTask,
    byType,
  };
}

/** "SecurityChecks-20261113.pdf", the old system's name for the same report. */
export const sheetFileName = (day: string): string => `SecurityChecks-${day.replace(/-/g, '')}.pdf`;
