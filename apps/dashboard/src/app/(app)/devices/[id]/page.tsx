import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { LiveStatus } from "@/components/live-status";
import { NoAccess } from "@/components/no-access";
import { PageSkeleton } from "@/components/skeleton";
import { deviceData, devicePage, deviceStory } from "@/lib/devices";
import { timeWithSeconds } from "@/lib/format";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

import { revokeDevice } from "../../setup/actions";
import { requestRelease } from "../actions";
import { DeviceView, StatusOf } from "./device-view";
import { RemoteControl, type DeviceCommandRow } from "./remote-control";

// A bundle period can run 31 days, so a little more than the chart is read for what was used since it renewed.
const DATA_DAYS = 35;
const STORY_LINES = 40;
const COMMANDS_SHOWN = 6;

/** What DigiGate staff last asked of this handheld, newest first, through row security. */
async function recentCommands(deviceId: string): Promise<DeviceCommandRow[]> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase
      .from("device_commands")
      .select("id, kind, requested_at, done_at, outcome, payload")
      .eq("device_id", deviceId)
      .order("requested_at", { ascending: false })
      .limit(COMMANDS_SHOWN),
  );
  return rows.map((row) => {
    const payload = typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload) ? row.payload : {};
    const version = payload.version_code;
    return {
      id: row.id,
      kind: row.kind,
      requestedAt: row.requested_at,
      doneAt: row.done_at,
      outcome: row.outcome,
      versionCode: typeof version === "number" ? version : null,
    };
  });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Device({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const acrossCompanies = isDigiGateStaff(user);
  if (!acrossCompanies && !["admin", "manager", "control_room"].some((role) => user.roles.includes(role))) redirect("/control-room");

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const device = await devicePage(id);
  if (!device) notFound();
  const now = readClock();
  const [data, story, commands] = await Promise.all([deviceData(id, DATA_DAYS), deviceStory(id, STORY_LINES), acrossCompanies ? recentCommands(id) : []]);

  return (
    <AppShell
      eyebrow={
        <span className="flex items-center gap-1.5">
          <Link href="/devices" className="transition-colors hover:text-brand">
            Devices
          </Link>
          <Icon name="chevron-right" className="size-3.5" />
          <span>{`${device.site} · ${device.company}`}</span>
        </span>
      }
      title={device.name}
      actions={
        device.canManage ? (
          <>
          {user.roles.includes("super_user") ? <ConfirmAction
            label="Release from DigiGate"
            title={`Release ${device.name}?`}
            confirmLabel="Yes, release it"
            pendingLabel="Releasing…"
            tone="danger"
            icon="unlock"
            action={requestRelease}
            fields={{ id: device.id }}
          >
            At its next sync it stops being locked to DigiGate: its other apps, hotspot and settings come back, and DigiGate becomes an ordinary app on it.
            It stays paired. Only super users can do this, and it&apos;s in the audit log.
          </ConfirmAction> : null}
          <ConfirmAction
            label="Revoke"
            title={`Revoke ${device.name}?`}
            confirmLabel="Yes, revoke it"
            pendingLabel="Revoking…"
            tone="danger"
            icon="result-warning"
            action={revokeDevice}
            fields={{ id: device.id }}
          >
            It stops working with DigiGate, signs out whoever is on it, and wipes its guards and data the next time it connects. To use it again you&apos;d pair it with a new code.
          </ConfirmAction>
          </>
        ) : null
      }
      chips={
        <>
          <StatusOf device={device} />
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
        </>
      }
    >
      {acrossCompanies && device.status !== "revoked" ? <RemoteControl deviceId={device.id} name={device.name} commands={commands} now={now} /> : null}
      <DeviceView device={device} data={data} story={story} now={now} full={acrossCompanies} />
    </AppShell>
  );
}

export default function DevicePageRoute({ params }: PageProps<"/devices/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Device params={params} />
    </Suspense>
  );
}
