"use client";

import { useActionState } from "react";

import { confirmCode, startEnrolment, type EnrolState, type FormState } from "@/app/login/actions";
import { Field, FormProblem, SubmitButton } from "@/components/form";
import { QrImage } from "@/components/qr-image";

const START: FormState = { problem: null };
const NOT_ENROLLED: EnrolState = { problem: null, factorId: null, qr: null, secret: null };

function CodeForm({ factorId }: { factorId: string }) {
  const [state, action] = useActionState(confirmCode, START);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormProblem message={state.problem} />
      <input type="hidden" name="factorId" value={factorId} />
      <Field label="6-digit code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
      <SubmitButton label="Continue" pendingLabel="Checking…" arrow />
    </form>
  );
}

export function EnterCode({ factorId }: { factorId: string }) {
  return <CodeForm factorId={factorId} />;
}

/** First sign-in: pair an authenticator app, then prove it works with one code. */
export function SetUpAuthenticator() {
  const [state, action] = useActionState(startEnrolment, NOT_ENROLLED);
  if (!state.factorId || !state.qr) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <FormProblem message={state.problem} />
        <SubmitButton label="Set up my authenticator app" pendingLabel="Starting…" arrow />
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <QrImage src={state.qr} alt="QR code for your authenticator app" />
      <p className="text-sm text-ink-muted">
        Scan this with Google Authenticator, Microsoft Authenticator or a similar app. If you can&apos;t scan, enter this key:{" "}
        <span className="break-all font-medium text-ink">{state.secret}</span>
      </p>
      <CodeForm factorId={state.factorId} />
    </div>
  );
}
