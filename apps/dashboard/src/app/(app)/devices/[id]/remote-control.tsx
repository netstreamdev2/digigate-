import { Card } from "@/components/card";
import { ConfirmAction } from "@/components/dialog";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Icon, type IconName } from "@/components/icon";
import { ago, shortDate, timeOfDay } from "@/lib/format";

import { requestAppUpdate, requestLock, requestRestart } from "../actions";

/*
 * A super user's remote control of one handheld: lock it, restart it, or send it a newer DigiGate. Each reaches the
 * handheld at its next sync (within a minute when it's online) and is carried out once; the list says what was asked
 * and how the handheld answered.
 */

export type DeviceCommandRow = {
  id: string;
  kind: string;
  requestedAt: string;
  doneAt: string | null;
  outcome: string | null;
  versionCode: number | null;
};

const KIND: Record<string, { label: string; icon: IconName }> = {
  lock: { label: "Lock", icon: "lock" },
  restart: { label: "Restart", icon: "refresh" },
  update_app: { label: "Update DigiGate", icon: "download" },
};

// What the handheld said, in plain words.
const OUTCOME: Record<string, string> = {
  locked: "Locked, screen off",
  "locked-app-only": "Locked (the screen stayed on)",
  restarting: "Restarted",
  "on-a-call": "Not restarted: it was on a call",
  installed: "Updated",
  "already-current": "Already up to date",
  "not-newer": "Not newer than what it has",
  "download-failed": "Couldn't download the update",
  "checksum-mismatch": "The download didn't match its SHA-256",
  "wrong-app": "That file isn't DigiGate",
  "not-an-app": "That file isn't an app",
  "not-device-owner": "DigiGate doesn't control this handheld",
  "not-supported": "This handheld's DigiGate is too old for this",
};

const outcomeOf = (row: DeviceCommandRow) => (row.outcome ? (OUTCOME[row.outcome] ?? `Didn't work (${row.outcome})`) : "Done");

export function RemoteControl({ deviceId, name, commands, now }: { deviceId: string; name: string; commands: readonly DeviceCommandRow[]; now: number }) {
  const waiting = (kind: string) => commands.some((row) => row.kind === kind && row.doneAt === null);

  return (
    <Card className="mt-6" title="Remote control" subtitle="Super users only. Reaches the handheld at its next sync, within a minute when it's online.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon="lock" title="Lock" detail={waiting("lock") ? "Waiting for the handheld" : "Signs the guard's screen out and turns it off"}>
          <ConfirmAction label="Lock" title={`Lock ${name}?`} confirmLabel="Yes, lock it" pendingLabel="Asking…" tone="neutral" icon="lock" action={requestLock} fields={{ id: deviceId }}>
            DigiGate locks, so the guard&apos;s PIN is needed, and the screen turns off. Use it for a handheld left lying around, or a guard who
            walked off still signed in.
          </ConfirmAction>
        </Tile>
        <Tile icon="refresh" title="Restart" detail={waiting("restart") ? "Waiting for the handheld" : "For a handheld that's misbehaving"}>
          <ConfirmAction label="Restart" title={`Restart ${name}?`} confirmLabel="Yes, restart it" pendingLabel="Asking…" tone="danger" icon="refresh" action={requestRestart} fields={{ id: deviceId }}>
            It restarts at once, even mid-check: everything already checked is kept, but a scan half done is lost. It&apos;s back in about a
            minute. It won&apos;t restart during a phone call.
          </ConfirmAction>
        </Tile>
        <Tile icon="download" title="Update DigiGate" detail={waiting("update_app") ? "Waiting for a quiet moment" : "Install a newer APK, no cable"}>
          <FormDialog compact label="Update" title={`Update DigiGate on ${name}`} icon="download" submitLabel="Send the update" pendingLabel="Sending…" action={requestAppUpdate} fields={{ id: deviceId }}>
            <p className="text-sm text-ink-muted">
              From an EAS build&apos;s page: its APK download link and its version code. The handheld downloads it, installs it when nobody is
              mid-check, and opens again on the new version. It refuses anything that isn&apos;t a newer DigiGate signed by us.
            </p>
            <Field label="APK download link" name="url" type="url" placeholder="https://expo.dev/artifacts/eas/….apk" required autoComplete="off" />
            <Field label="Version code" name="versionCode" inputMode="numeric" placeholder="5" required autoComplete="off" />
            <Field label="SHA-256 (optional)" name="sha256" placeholder="Leave blank if you don't have it" autoComplete="off" />
          </FormDialog>
        </Tile>
      </div>

      {commands.length > 0 ? (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-md border border-border">
          {commands.map((row) => {
            const kind = KIND[row.kind] ?? { label: row.kind, icon: "device" as const };
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Icon name={kind.icon} className="size-4 shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{row.versionCode ? `${kind.label} to version ${row.versionCode}` : kind.label}</span>
                  <span className="block text-xs text-ink-muted">{`Asked ${shortDate(row.requestedAt)}, ${timeOfDay(row.requestedAt)}`}</span>
                </span>
                <span className={`shrink-0 text-right text-xs font-semibold ${row.doneAt === null ? "text-warning" : row.outcome && !OK.has(row.outcome) ? "text-blocked" : "text-clear"}`}>
                  {row.doneAt === null ? "Waiting" : `${outcomeOf(row)} · ${ago(row.doneAt, now)}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Card>
  );
}

const OK = new Set(["locked", "locked-app-only", "restarting", "installed", "already-current"]);

function Tile({ icon, title, detail, children }: { icon: IconName; title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-muted p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-surface text-brand">
          <Icon name={icon} className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-ink-muted">{detail}</span>
        </span>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}
