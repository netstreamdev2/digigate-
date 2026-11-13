import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const MFA_PATH = "/mfa";
const LOGIN_PATH = "/login";
const PASSWORD_PATH = "/password";

/**
 * Keeps the session fresh and sends people to the right door: no session goes to sign-in, and a session that hasn't
 * passed MFA goes to the code screen. The database enforces the same rule, so this is the guide, not the lock. Someone
 * on a temporary password has to replace it before they go anywhere else.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const redirectTo = (target: string) => NextResponse.redirect(new URL(target, request.url));

  if (!user) return path === LOGIN_PATH ? response : redirectTo(LOGIN_PATH);

  // MFA is a switch in the database (digigate.platform_settings), off since 13 November. When it's on, a session that
  // hasn't passed it goes to the code screen; when it's off, the code screen is still there for anyone who opens it.
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel !== "aal2") {
    const { data: required, error } = await supabase.schema("digigate").rpc("mfa_required");
    // If the switch can't be read, ask for the code: never let a failed read lower the bar.
    if (error || required !== false) return path === MFA_PATH ? response : redirectTo(MFA_PATH);
  }
  if (user.app_metadata.must_change_password === true) return path === PASSWORD_PATH ? response : redirectTo(PASSWORD_PATH);
  return [LOGIN_PATH, PASSWORD_PATH].includes(path) ? redirectTo("/setup") : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|webp)$).*)"],
};
