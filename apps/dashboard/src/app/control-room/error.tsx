"use client";

import { RetryScreen } from "@/components/retry-screen";

/** Says plainly that the screen is out of date rather than showing an empty, quiet-looking gate. */
export default function ControlRoomError({ reset }: { reset: () => void }) {
  return (
    <RetryScreen
      title="Can't reach the gates right now"
      message="This screen isn't showing live data. It's trying again by itself. Call the gate directly if something can't wait."
      reset={reset}
    />
  );
}
