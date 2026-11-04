"use client";

import Image from "next/image";
import { useState, useTransition } from "react";

import { CancelButton, Dialog, DialogHeading, useDialog } from "@/components/dialog";

import { openSelfie } from "./actions";

const PHOTO_WIDTH = 480;
const PHOTO_HEIGHT = 640;

/** Asks for the photo only when someone opens it: each look is logged, and the link it gets lasts a minute. */
export function SelfieButton({ shiftId, guard }: { shiftId: string; guard: string }) {
  const dialog = useDialog();
  const [loading, startLoading] = useTransition();
  const [photo, setPhoto] = useState<{ url: string | null; problem: string | null }>({ url: null, problem: null });

  const open = () => {
    dialog.open();
    startLoading(async () => setPhoto(await openSelfie(shiftId)));
  };

  return (
    <>
      <button type="button" onClick={open} className="shrink-0 rounded-pill bg-surface-muted px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-border">
        View selfie
      </button>
      <Dialog dialogRef={dialog.ref} onClose={() => setPhoto({ url: null, problem: null })}>
        <DialogHeading icon="guard" tone="neutral" title={guard} />
        <div className="mt-5">
          {photo.url ? (
            <Image unoptimized src={photo.url} alt={`${guard} at the start of this shift`} width={PHOTO_WIDTH} height={PHOTO_HEIGHT} className="mx-auto max-h-[60vh] w-auto rounded-md object-contain" />
          ) : (
            <p role={photo.problem ? "alert" : undefined} className="py-10 text-center text-sm text-ink-muted">
              {loading ? "Opening…" : photo.problem}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end">
          <CancelButton onClick={dialog.close} label="Close" />
        </div>
      </Dialog>
    </>
  );
}
