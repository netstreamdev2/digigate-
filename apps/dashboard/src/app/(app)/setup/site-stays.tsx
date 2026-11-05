import { expectedStayLabel, STAY_CHOICES, stayMinutesFor, visitTypesFor } from "@digigate/core";

import { SelectField } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";

import { saveSiteStays } from "./stay-actions";

type Props = { siteId: string; siteType: string; stayMinutes: unknown };

const NO_LIMIT = "none";

/** The site's own stays, as saved: minutes or null per visit type. Anything else is left out. */
function savedStays(value: unknown): Record<string, number | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number | null] => entry[1] === null || typeof entry[1] === "number"));
}

/**
 * How long each kind of visit is expected to last at this site. The guard sees it picked at the gate and can change it
 * for one visit; past it, the control room sees the visit as over its time. Handhelds pick it up on their next sync.
 */
export function SiteStaysButton({ siteId, siteType, stayMinutes }: Props) {
  const stays = stayMinutesFor(siteType, savedStays(stayMinutes));
  const types = visitTypesFor(siteType);
  if (types.length === 0) return null;

  return (
    <FormDialog label="Expected stays" title="How long each visit should last" icon="duration" submitLabel="Save stays" pendingLabel="Saving…" action={saveSiteStays} fields={{ siteId }}>
      <p className="text-sm text-ink-muted">
        The guard sees this picked at the gate and can change it for one visit. Anyone still on site after it shows as over their time in the control room. It never stops anyone at the gate.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {types.map((type) => {
          const current = stays[type.code] ?? null;
          const choices = STAY_CHOICES.includes(current) ? STAY_CHOICES : [current, ...STAY_CHOICES];
          return (
            <SelectField key={type.code} label={type.label} name={type.code} defaultValue={current === null ? NO_LIMIT : String(current)}>
              {choices.map((minutes) => (
                <option key={minutes ?? NO_LIMIT} value={minutes === null ? NO_LIMIT : String(minutes)}>
                  {expectedStayLabel(minutes)}
                </option>
              ))}
            </SelectField>
          );
        })}
      </div>
    </FormDialog>
  );
}
