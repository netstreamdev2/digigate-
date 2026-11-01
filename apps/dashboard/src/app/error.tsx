"use client";

import { RetryScreen } from "@/components/retry-screen";

export default function AppError({ reset }: { reset: () => void }) {
  return <RetryScreen title="This page didn't load" message="The problem is on our side, not yours. It's trying again by itself." reset={reset} />;
}
