"use client";

import { useActionState, useState } from "react";

import { Field, FormProblem, SubmitButton } from "@/components/form";

import { signIn, type FormState } from "./actions";

const START: FormState = { problem: null };

export function LoginForm() {
  const [state, action] = useActionState(signIn, START);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormProblem message={state.problem} />
      <Field label="Username or email" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required />
      <div className="relative">
        <Field label="Password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="pr-16" required />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-pressed={showPassword}
          className="absolute bottom-0 right-1 h-12 px-3 text-xs font-semibold text-ink-muted hover:text-ink"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      <SubmitButton label="Sign in" pendingLabel="Signing in…" arrow />
    </form>
  );
}
