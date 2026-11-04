"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ConfirmButton, Dialog, useDialog } from "@/components/dialog";
import { Field, FormProblem } from "@/components/form";
import { Icon } from "@/components/icon";
import { QrImage } from "@/components/qr-image";

import { createPairingCode, deviceWasPaired, pairingChoices, siteReadiness, type PairingChoices, type PairingLevel, type PairingOption, type PairingState, type SiteReadiness } from "./actions";

/** Where the device is going, known up front on a site's own page. */
export type PairingPlace = { company: PairingOption; site: PairingOption };

type Chosen = Partial<PairingPlace>;
type Step = PairingLevel | "name" | "scan" | "done";
type Paired = { pairing: PairingState; deviceName: string };

const STEPS: readonly Step[] = ["company", "site", "name", "scan"];
const NO_CODE: PairingState = { problem: null, code: null, qr: null, expiresAt: null, createdAt: null };
const SEARCH_DELAY_MS = 250;
const CHECK_EVERY_MS = 3000;

const TITLES: Record<Exclude<Step, "done">, string> = {
  company: "Which security company?",
  site: "Which site?",
  name: "Name this device",
  scan: "Scan this on the handheld",
};

const PICKER_WORDS: Record<PairingLevel, { search: string; none: string; empty: string }> = {
  company: { search: "Search companies", none: "No company matches that.", empty: "There are no companies yet." },
  site: { search: "Search sites", none: "No site matches that.", empty: "This company has no sites yet." },
};

const QUIET_BUTTON = "inline-flex h-11 items-center justify-center rounded-pill bg-surface-muted px-5 text-sm font-semibold text-ink transition hover:bg-border";
const MAIN_BUTTON = "inline-flex h-11 items-center justify-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink";
const NOTE_LINK = "font-semibold text-brand underline-offset-2 hover:underline";

const groupCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;

function countdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function firstStep({ company, site }: Chosen): Step {
  if (!company) return "company";
  return site ? "name" : "site";
}

/** Long lists are searched, never scrolled. A step with only one possible answer answers itself. */
function Picker({ level, parentId, setupHref, onPick }: { level: PairingLevel; parentId: string; setupHref: string | null; onPick: (option: PairingOption, automatic: boolean) => void }) {
  const words = PICKER_WORDS[level];
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<PairingChoices | null>(null);

  useEffect(() => {
    let current = true;
    const term = search.trim();
    const timer = setTimeout(() => {
      pairingChoices(level, parentId, term).then(
        (choices) => {
          if (!current) return;
          const [only] = choices.options;
          if (!term && choices.total === 1 && only) onPick(only, true);
          else setFound(choices);
        },
        () => {
          if (current) setFound({ options: [], total: 0, problem: "That didn't load. Check your connection and try again." });
        },
      );
    }, term ? SEARCH_DELAY_MS : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [level, onPick, parentId, search]);

  return (
    <div className="mt-5">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={words.search}
        aria-label={words.search}
        autoFocus
        className="h-12 w-full rounded-md border border-border bg-surface px-4 text-sm outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-tile-sky"
      />
      <div className="mt-3 min-h-40">
        {found === null ? <p className="py-6 text-center text-sm text-ink-muted">Loading…</p> : null}
        {found?.problem ? <FormProblem message={found.problem} /> : null}
        {found && !found.problem && found.options.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {search.trim() ? words.none : words.empty}
            {!search.trim() && setupHref ? (
              <>
                {" "}
                <Link href={setupHref} className={NOTE_LINK}>
                  Add one first
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {found && found.options.length > 0 ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {found.options.map((option) => (
              <li key={option.id}>
                <button type="button" onClick={() => onPick(option, false)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition hover:bg-surface-muted">
                  <span className="min-w-0 truncate">{option.name}</span>
                  <Icon name="chevron-right" className="size-4 shrink-0 text-ink-subtle" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {found && found.total > found.options.length ? <p className="mt-2 text-xs text-ink-muted">{`Showing ${found.options.length} of ${found.total}. Search to find the rest.`}</p> : null}
      </div>
    </div>
  );
}

function ReadinessNote({ href, action, children }: { href: string; action: string; children: ReactNode }) {
  return (
    <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-ink">
      {children}{" "}
      <Link href={href} className={NOTE_LINK}>
        {action}
      </Link>
    </p>
  );
}

function NameStep({ place, name, onBack, onCode }: { place: PairingPlace; name: string; onBack: (() => void) | null; onCode: (paired: Paired) => void }) {
  const [state, action, pending] = useActionState(createPairingCode, NO_CODE);
  const [deviceName, setDeviceName] = useState(name);
  const [readiness, setReadiness] = useState<SiteReadiness | null>(null);
  const siteId = place.site.id;

  useEffect(() => {
    let current = true;
    siteReadiness(siteId).then(
      (found) => {
        if (current) setReadiness(found);
      },
      // These are only reminders, and pairing works without them.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [siteId]);

  useEffect(() => {
    if (state.code) onCode({ pairing: state, deviceName });
  }, [deviceName, onCode, state]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setDeviceName(String(form.get("name") ?? "").trim());
    startTransition(() => action(form));
  };

  const setupHref = `/setup/${place.company.id}/${siteId}`;
  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
      <FormProblem message={state.problem} />
      <input type="hidden" name="orgId" value={place.company.id} />
      <input type="hidden" name="siteId" value={siteId} />
      <Field label="Device name" name="name" defaultValue={name} placeholder="Main Gate DT50" autoComplete="off" autoFocus required />
      <p className="-mt-2 text-sm text-ink-muted">Use the name of its gate, so the control room can tell handhelds apart.</p>
      {readiness?.posts === 0 ? (
        <ReadinessNote href={setupHref} action="Add an access point">
          This site has no access points, so a guard can&apos;t start a shift here yet.
        </ReadinessNote>
      ) : null}
      {readiness?.staff === 0 ? (
        <ReadinessNote href={`${setupHref}?tab=staff`} action="Add gate staff">
          Nobody can sign in at this site yet.
        </ReadinessNote>
      ) : null}
      <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className={QUIET_BUTTON}>
            Back
          </button>
        ) : (
          <span />
        )}
        <ConfirmButton label="Show pairing code" pendingLabel="Creating…" tone="neutral" pending={pending} />
      </div>
    </form>
  );
}

function ScanStep({ siteId, paired: { pairing, deviceName }, onBack, onPaired }: { siteId: string; paired: Paired; onBack: () => void; onPaired: () => void }) {
  const expiresAt = pairing.expiresAt ? new Date(pairing.expiresAt).getTime() : 0;
  const since = pairing.createdAt ?? "";
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(expiresAt - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // A failed look just means looking again: the code still works, and the page says it's still waiting.
  const expired = left !== null && left <= 0;
  useEffect(() => {
    if (expired) return;
    let current = true;
    const timer = setInterval(() => {
      deviceWasPaired(siteId, deviceName, since).then(
        (done) => {
          if (done && current) onPaired();
        },
        () => undefined,
      );
    }, CHECK_EVERY_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [deviceName, expired, onPaired, since, siteId]);

  if (expired) {
    return (
      <div className="mt-5">
        <p className="rounded-md bg-warning-soft px-4 py-3 text-sm">That code ran out before the handheld used it. Codes last 10 minutes.</p>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onBack} className={MAIN_BUTTON}>
            Get a new code
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="flex flex-col items-center gap-3 rounded-md bg-surface-muted p-5">
        {pairing.qr ? <QrImage src={pairing.qr} alt="Pairing QR code" /> : null}
        {pairing.code ? <p className="font-display text-2xl font-bold tracking-wide">{groupCode(pairing.code)}</p> : null}
        <p className="text-xs tabular-nums text-ink-muted">{left === null ? " " : `Expires in ${countdown(left)}`}</p>
      </div>
      <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
        <li>Connect the handheld to Wi-Fi or mobile data. It only needs this once.</li>
        <li>
          Open DigiGate and tap <span className="font-semibold text-ink">Pair this device</span> on the sign-in screen.
        </li>
        <li>Press the scan button and aim at the code, or type the digits.</li>
      </ol>
      <p role="status" className="mt-4 flex items-center gap-2 text-sm font-medium">
        <span className="size-2 animate-pulse rounded-pill bg-brand" aria-hidden="true" />
        Waiting for the handheld…
      </p>
      <div className="mt-6 flex justify-start">
        <button type="button" onClick={onBack} className={QUIET_BUTTON}>
          Back
        </button>
      </div>
    </div>
  );
}

function DoneStep({ siteName, deviceName, onAnother, onClose }: { siteName: string; deviceName: string; onAnother: () => void; onClose: () => void }) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-pill bg-clear-soft text-clear">
        <Icon name="result-clear" className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-xl font-bold tracking-tight">{`${deviceName} is paired`}</h2>
      <p className="mt-2 text-sm text-ink-muted">{`It belongs to ${siteName} now, and keeps working with no connection. Guards sign in on it with their employee number and PIN.`}</p>
      <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <button type="button" onClick={onAnother} className={QUIET_BUTTON}>
          Pair another
        </button>
        <button type="button" onClick={onClose} className={MAIN_BUTTON}>
          Done
        </button>
      </div>
    </div>
  );
}

function Walkthrough({ place, onClose }: { place?: PairingPlace; onClose: () => void }) {
  const [chosen, setChosen] = useState<Chosen>(place ?? {});
  // Only the steps actually shown, so Back never lands on one that answered itself.
  const [trail, setTrail] = useState<readonly Step[]>([firstStep(place ?? {})]);
  const [skipped, setSkipped] = useState<readonly Step[]>([]);
  const [paired, setPaired] = useState<Paired | null>(null);
  const [lastName, setLastName] = useState("");

  const step = trail[trail.length - 1] ?? "company";
  const steps = STEPS.slice(STEPS.indexOf(firstStep(place ?? {}))).filter((item) => !skipped.includes(item));
  const position = steps.indexOf(step);

  const back = () => setTrail((current) => current.slice(0, -1));
  const canGoBack = trail.length > 1;

  const pick = useCallback((level: PairingLevel, option: PairingOption, automatic: boolean) => {
    setChosen((current) => ({ ...current, [level]: option }));
    if (automatic) setSkipped((current) => [...current, level]);
    const next = STEPS[STEPS.indexOf(level) + 1] ?? "name";
    setTrail((current) => [...(automatic ? current.slice(0, -1) : current), next]);
  }, []);
  const pickCompany = useCallback((option: PairingOption, automatic: boolean) => pick("company", option, automatic), [pick]);
  const pickSite = useCallback((option: PairingOption, automatic: boolean) => pick("site", option, automatic), [pick]);

  const showCode = useCallback((next: Paired) => {
    setPaired(next);
    setLastName(next.deviceName);
    setTrail((current) => [...current, "scan"]);
  }, []);

  const finish = useCallback(() => setTrail(["done"]), []);

  const anotherOne = () => {
    setPaired(null);
    setLastName("");
    setTrail([firstStep(chosen)]);
  };

  const { company, site } = chosen;
  const whereSoFar = [company?.name, site?.name].filter(Boolean);

  if (step === "done" && site) return <DoneStep siteName={site.name} deviceName={lastName} onAnother={anotherOne} onClose={onClose} />;

  return (
    <>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-tile-sky text-brand">
          <Icon name="device" className="size-6" />
        </span>
        <div className="min-w-0 self-center">
          <p className="text-xs font-semibold text-ink-subtle">{`Step ${position + 1} of ${steps.length}`}</p>
          <h2 className="font-display text-xl font-bold tracking-tight">{step === "done" ? "" : TITLES[step]}</h2>
        </div>
      </div>
      <div className="mt-4 flex gap-1.5" aria-hidden="true">
        {steps.map((item, index) => (
          <span key={item} className={`h-1 flex-1 rounded-pill ${index <= position ? "bg-brand" : "bg-surface-muted"}`} />
        ))}
      </div>
      {whereSoFar.length ? <p className="mt-3 text-xs text-ink-muted">{whereSoFar.join(" · ")}</p> : null}

      {step === "company" ? <Picker key="company" level="company" parentId="" setupHref="/setup" onPick={pickCompany} /> : null}
      {step === "site" && company ? <Picker key="site" level="site" parentId={company.id} setupHref={`/setup/${company.id}`} onPick={pickSite} /> : null}
      {step === "name" && company && site ? <NameStep key="name" place={{ company, site }} name={lastName} onBack={canGoBack ? back : null} onCode={showCode} /> : null}
      {step === "scan" && site && paired ? <ScanStep siteId={site.id} paired={paired} onBack={back} onPaired={finish} /> : null}

      {(step === "company" || step === "site") ? (
        <div className="mt-4 flex justify-between">
          {canGoBack ? (
            <button type="button" onClick={back} className={QUIET_BUTTON}>
              Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className={QUIET_BUTTON}>
              Cancel
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

/** Pairing from anywhere. Given a site it starts at naming the device; otherwise it walks there, one choice at a time. */
export function PairDeviceButton({ place, compact = false, label = "Pair a device" }: { place?: PairingPlace; compact?: boolean; label?: string }) {
  const dialog = useDialog();
  const router = useRouter();
  // Only there while open: nothing is fetched until someone asks, and closing leaves no code behind the popup. The page
  // catches up on closing, so a checklist ticking itself off can't take the popup away mid-way.
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    router.refresh();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.open();
        }}
        className={
          compact
            ? "shrink-0 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border"
            : "inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse transition hover:bg-ink"
        }
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref} onClose={close}>
        {open ? <Walkthrough place={place} onClose={dialog.close} /> : null}
      </Dialog>
    </>
  );
}
