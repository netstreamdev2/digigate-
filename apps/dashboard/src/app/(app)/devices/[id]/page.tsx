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
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";

import { revokeDevice } from "../../setup/actions";
import { DeviceView, StatusOf } from "./device-view";

// A bundle period can run 31 days, so a little more than the chart is read for what was used since it renewed.
const DATA_DAYS = 35;
const STORY_LINES = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Device({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  if (!user.roles.includes("super_user") && !user.roles.includes("admin")) redirect("/control-room");

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const device = await devicePage(id);
  if (!device) notFound();
  const now = readClock();
  const [data, story] = await Promise.all([deviceData(id, DATA_DAYS), deviceStory(id, STORY_LINES)]);

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
        ) : null
      }
      chips={
        <>
          <StatusOf device={device} />
          <LiveStatus renderedAt={now} updatedAt={timeWithSeconds(now)} />
        </>
      }
    >
      <DeviceView device={device} data={data} story={story} now={now} />
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
