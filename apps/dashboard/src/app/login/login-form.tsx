"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { CompanyMark } from "@/components/company-mark";
import { Field, FormProblem, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";

import { signIn, type SignInState } from "./actions";

const START: SignInState = { problem: null, choices: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, START);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const send = (company: string | null) => {
    const form = new FormData();
    form.set("login", login);
    form.set("password", password);
    if (company) form.set("company", company);
    startTransition(() => action(form));
  };

  // Sent by hand, so a refused sign-in keeps what was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send(null);
  };

  if (state.choices && state.choices.length > 1) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-display text-xl font-bold tracking-tight">Which company?</p>
          <p className="mt-1 text-sm text-ink-muted">You have a login at more than one. Pick the one to sign in to.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {state.choices.map((choice) => (
            <li key={choice.code}>
              <button
                type="button"
                disabled={pending}
                onClick={() => send(choice.code)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:border-brand hover:shadow-card disabled:opacity-50"
              >
                <CompanyMark company={{ id: choice.code, name: choice.company, logoUrl: choice.logoUrl, color: choice.color }} size={40} />
                <span className="flex-1 font-semibold">{choice.company}</span>
                <Icon name="chevron-right" className="size-5 text-ink-subtle" />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => window.location.reload()} className="self-start text-sm font-semibold text-ink-muted hover:text-ink">
          Use another login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormProblem message={state.problem} />
      <Field
        label="Username or email"
        name="login"
        value={login}
        onChange={(event) => setLogin(event.target.value)}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        required
      />
      <div className="relative">
        <Field
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="pr-16"
          required
        />
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
