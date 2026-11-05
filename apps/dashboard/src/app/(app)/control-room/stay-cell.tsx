import { TwoLine } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { duration } from "@/lib/format";

type Props = { enteredAt: string; expectedUntil: string | null; now: number };

/**
 * How long someone has been on site, and how long they have left of the stay the guard recorded. Past it, the time
 * over shows in red with the overstay icon, pulsing gently so it catches the eye (steady for anyone who asked for less
 * motion): never colour alone.
 */
export function StayCell({ enteredAt, expectedUntil, now }: Props) {
  const onSite = duration(enteredAt, now);
  if (!expectedUntil) return <TwoLine main={onSite} sub="No time set" />;
  if (new Date(expectedUntil).getTime() >= now) return <TwoLine main={onSite} sub={`${duration(now, expectedUntil)} left`} />;
  return (
    <>
      <p className="font-medium">{onSite}</p>
      <p className="dg-overstay mt-0.5 inline-flex items-center gap-1 rounded-pill bg-blocked-soft px-2 py-0.5 text-xs font-semibold text-blocked">
        <Icon name="overstay" className="size-3.5" />
        {`Over by ${duration(expectedUntil, now)}`}
      </p>
    </>
  );
}
