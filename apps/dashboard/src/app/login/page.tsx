import { AuthLayout } from "@/components/auth-layout";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your gates." welcome footnote="Private dashboard. Every account signs in with a second step.">
      <LoginForm />
    </AuthLayout>
  );
}
