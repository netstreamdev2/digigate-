import { AuthLayout } from "@/components/auth-layout";

import { PasswordForm } from "./password-form";

export default function PasswordPage() {
  return (
    <AuthLayout title="Choose your password" subtitle="Your temporary password has done its job. Use at least 12 characters.">
      <PasswordForm />
    </AuthLayout>
  );
}
