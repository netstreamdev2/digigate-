// What a report says, shared by the dashboard, the PDF and the email so a number can never differ between them. One file
// with no imports, because the report Edge Function reads it directly from Deno.

export const REPORT_FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;

export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

export type ReportFigures = {
  checks: number;
  vehicles_in: number;
  people_in: number;
  exits: number;
  /** Exits whose stay is known. The old system's exits have none, so they count as exits but not towards the average stay. */
  timed_exits?: number;
  stay_minutes: number;
  blocked: number;
  warnings: number;
  overrides: number;
  turned_away: number;
  acknowledged: number;
  active_sites: number;
};

export type ReportSiteLine = {
  site_id: string;
  site: string;
  client: string;
  checks: number;
  entries: number;
  exits: number;
  blocked: number;
  warnings: number;
  overrides: number;
};

export type ReportData = {
  company: string;
  client: string | null;
  frequency: ReportFrequency;
  from: string;
  to: string;
  prior_from: string;
  prior_to: string;
  /** The period hasn't finished, so its comparison covers the same days of the one before. */
  in_progress?: boolean;
  totals: Partial<ReportFigures>;
  prior: Partial<ReportFigures>;
  days: readonly { day: string; checks: number; entries: number }[];
  hours: readonly number[];
  rules: readonly { code: string; hits: number }[];
  visit_types: readonly { type: string; visits: number }[];
  sites: readonly ReportSiteLine[];
};

export type ReportBucket = { label: string; detail: string; value: number };

export const RULE_TITLES: Readonly<Record<string, string>> = {
  HOTLIST_MATCH: 'On the hotlist',
  DRIVER_VEHICLE_MISMATCH: 'Vehicle swap',
  WALKED_IN_DRIVING_OUT: 'Walked in, driving out',
  UNKNOWN_DRIVER: 'Unknown driver',
  NO_ENTRY_RECORD: 'No entry record',
  ARRIVED_BEFORE_DIGIGATE: 'Came in before DigiGate',
  PLATE_DISC_MISMATCH: "Plate doesn't match disc",
  DISC_CLONE_ON_SITE: 'Possible cloned plate or disc',
  DISC_CHANGED_ON_SITE: 'Disc changed since entry',
  PLATE_VIN_HISTORY_CONFLICT: 'Plate and VIN history conflict',
  DUPLICATE_ENTRY: 'Already on site',
  DRIVER_ALREADY_ON_SITE: 'Driver already on site',
  DISC_EXPIRED: 'Licence disc expired',
  LICENCE_EXPIRED: "Driver's licence expired",
  OCCUPANT_COUNT_DROP: 'Fewer people leaving',
  OCCUPANT_COUNT_RISE: 'More people leaving',
  OVERSTAY: 'Overstay',
  IGNITION_RESTART_FAILED: "Engine didn't restart",
  BOOT_CHECK_PROBLEM: 'Problem found in the boot',
  PEDESTRIAN_DUPLICATE_ENTRY: 'Already on site',
  PEDESTRIAN_NO_ENTRY: 'No entry record',
  DRIVER_LEFT_ON_FOOT: 'Driver left on foot',
  UNFAMILIAR_VEHICLE: 'Unfamiliar vehicle',
  LEFT_POST: 'Guard left their post',
  GUARD_ON_TWO_DEVICES: 'Guard on two handhelds',
  INVITE_REUSED: 'One-visit invite used twice',
  INVITE_CANCELLED: 'Cancelled invite used',
  HANDHELD_RELEASED: 'Handheld released from DigiGate',
  SIM_REMOVED: 'SIM card taken out',
  MOBILE_DATA_OFF: 'Mobile data switched off',
  AIRPLANE_MODE_ON: 'Airplane mode switched on',
  DIGIGATE_CLOSED: 'DigiGate closed on the handheld',
};

const FREQUENCY_LABELS: Readonly<Record<ReportFrequency, string>> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);
const monthOf = (day: string) => dateOf(day).getUTCMonth();
const yearOf = (day: string) => dateOf(day).getUTCFullYear();
const dayOf = (day: string) => dateOf(day).getUTCDate();

export const isReportFrequency = (value: string): value is ReportFrequency => REPORT_FREQUENCIES.some((frequency) => frequency === value);

export const frequencyLabel = (frequency: ReportFrequency): string => FREQUENCY_LABELS[frequency];

export const reportTitle = (frequency: ReportFrequency): string => `${FREQUENCY_LABELS[frequency]} report`;

export const ruleTitle = (code: string): string => RULE_TITLES[code] ?? code;

/** The rules that fired, most first. Cars and walk-ins have their own rule for the same thing, so one title adds up both. */
export function ruleLines(rules: ReportData['rules']): { label: string; value: number }[] {
  const totals = new Map<string, number>();
  for (const { code, hits } of rules) totals.set(ruleTitle(code), (totals.get(ruleTitle(code)) ?? 0) + hits);
  return [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** A stored code in plain words: patient_dropoff becomes Patient dropoff. */
export function plainLabel(code: string): string {
  const words = code.replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const shortDay = (day: string): string => `${dayOf(day)} ${MONTHS[monthOf(day)]}`;

export function periodLabel(frequency: ReportFrequency, from: string, to: string): string {
  switch (frequency) {
    case 'daily':
      return `${WEEKDAYS[dateOf(from).getUTCDay()]} ${dayOf(from)} ${FULL_MONTHS[monthOf(from)]} ${yearOf(from)}`;
    case 'weekly':
      return yearOf(from) === yearOf(to) ? `${shortDay(from)} – ${shortDay(to)} ${yearOf(to)}` : `${shortDay(from)} ${yearOf(from)} – ${shortDay(to)} ${yearOf(to)}`;
    case 'monthly':
      return `${FULL_MONTHS[monthOf(from)]} ${yearOf(from)}`;
    case 'quarterly':
      return `Q${Math.floor(monthOf(from) / 3) + 1} ${yearOf(from)}, ${MONTHS[monthOf(from)]} – ${MONTHS[monthOf(to)]}`;
    case 'yearly':
      return String(yearOf(from));
  }
}

/** The period's name, saying so when it hasn't finished yet. */
export function periodHeading(data: Pick<ReportData, 'frequency' | 'from' | 'to' | 'in_progress'>): string {
  const label = periodLabel(data.frequency, data.from, data.to);
  return data.in_progress ? `${label}, so far` : label;
}

/** A day still running can't be compared with a whole day, so it shows no change at all. */
export const canCompare = (data: Pick<ReportData, 'frequency' | 'in_progress'>): boolean => !(data.in_progress && data.frequency === 'daily');

/** What the period before this one is called, for "compared with" lines. */
export function priorLabel(frequency: ReportFrequency): string {
  return { daily: 'the day before', weekly: 'the week before', monthly: 'the month before', quarterly: 'the quarter before', yearly: 'the year before' }[frequency];
}

export const reportScope = (data: Pick<ReportData, 'company' | 'client'>): string => data.client ?? data.company;

export const reportSubject = (data: Pick<ReportData, 'company' | 'client' | 'frequency' | 'from' | 'to' | 'in_progress'>): string =>
  `${reportScope(data)}: ${reportTitle(data.frequency)}, ${periodHeading(data)}`;

export function reportFileName(data: Pick<ReportData, 'company' | 'client' | 'frequency' | 'from'>): string {
  const scope = reportScope(data)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `digigate-${scope || 'report'}-${data.frequency}-${data.from}.pdf`;
}

/** The percentage change on the period before, or null when there's nothing to compare with. */
export function percentChange(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

/** The average stay over the exits whose stay is known; figures from before timed_exits existed use every exit. */
export const averageStay = (figures: Partial<ReportFigures>): number => {
  const timed = figures.timed_exits ?? figures.exits ?? 0;
  return timed > 0 ? Math.round((figures.stay_minutes ?? 0) / timed) : 0;
};

export const entriesOf = (figures: Partial<ReportFigures>): number => (figures.vehicles_in ?? 0) + (figures.people_in ?? 0);

/** A length of time in plain words, e.g. 1h 36m. */
export function stayLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export const countLabel = (value: number): string => value.toLocaleString('en-ZA').replace(/[  ]/g, ' ');

/** A count short enough for a chart axis or a tile: 1 284, 12.9K, 1.2M. */
export function compactCount(value: number): string {
  if (value < 10_000) return countLabel(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

function hourBuckets(hours: readonly number[]): ReportBucket[] {
  return hours.map((value, hour) => {
    const start = String(hour).padStart(2, '0');
    return { label: start, detail: `${start}:00 to ${String(hour + 1).padStart(2, '0')}:00`, value };
  });
}

/** The busiest time of day, whatever the period. */
export const hourSeries = (data: Pick<ReportData, 'hours'>): ReportBucket[] => hourBuckets(data.hours);

/**
 * Activity over the period, as many bars as read well: a day by the hour, a week or month by the day, a quarter by the
 * week and a year by the month.
 */
export function activitySeries(data: Pick<ReportData, 'frequency' | 'days' | 'hours'>): ReportBucket[] {
  switch (data.frequency) {
    case 'daily':
      return hourBuckets(data.hours);
    case 'weekly':
      return data.days.map(({ day, checks }) => ({ label: (WEEKDAYS[dateOf(day).getUTCDay()] ?? '').slice(0, 3), detail: shortDay(day), value: checks }));
    case 'monthly':
      return data.days.map(({ day, checks }) => ({ label: String(dayOf(day)), detail: shortDay(day), value: checks }));
    case 'quarterly': {
      const weeks: ReportBucket[] = [];
      for (let start = 0; start < data.days.length; start += 7) {
        const days = data.days.slice(start, start + 7);
        const first = days[0]?.day ?? '';
        const last = days[days.length - 1]?.day ?? first;
        weeks.push({ label: shortDay(first), detail: `${shortDay(first)} – ${shortDay(last)}`, value: days.reduce((sum, { checks }) => sum + checks, 0) });
      }
      return weeks;
    }
    case 'yearly':
      return MONTHS.map((month, index) => ({
        label: month,
        detail: FULL_MONTHS[index] ?? month,
        value: data.days.filter(({ day }) => monthOf(day) === index).reduce((sum, { checks }) => sum + checks, 0),
      }));
  }
}

export const activityUnit = (frequency: ReportFrequency): string =>
  ({ daily: 'by the hour', weekly: 'by the day', monthly: 'by the day', quarterly: 'by the week', yearly: 'by the month' })[frequency];
