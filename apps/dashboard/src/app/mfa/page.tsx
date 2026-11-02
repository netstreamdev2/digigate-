import { Suspense } from "react";

import { AuthLayout } from "@/components/auth-layout";
import { supabaseServer } from "@/lib/supabase/server";

import { EnterCode, SetUpAuthenticator } from "./mfa-forms";

async function MfaStep() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  return factor ? <EnterCode factorId={factor.id} /> : <SetUpAuthenticator />;
}

export default function MfaPage() {
  return (
    <AuthLayout title="One more step" subtitle="Every sign-in needs a code from your authenticator app.">
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <MfaStep />
      </Suspense>
    </AuthLayout>
  );
}
