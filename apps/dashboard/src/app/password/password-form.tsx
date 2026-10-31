"use client";

import { useActionState } from "react";

import { changePassword, type FormState } from "@/app/login/actions";
import { Field, FormProblem, SubmitButton } from "@/components/form";

const START: FormState = { problem: null };

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, START);
  return (
    <form action={action} className="flex flex-col gap-5">
      <FormProblem message={state.problem} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} autoFocus required />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      <SubmitButton label="Save and continue" pendingLabel="Saving…" arrow />
    </form>
  );
}
