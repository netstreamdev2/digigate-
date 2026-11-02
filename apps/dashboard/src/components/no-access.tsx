import { signOut } from "@/app/login/actions";

/** For someone signed in who can't use this page, with a way out. */
export function NoAccess({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-ink-muted">{message}</p>
        <form action={signOut}>
          <button type="submit" className="text-sm font-semibold text-ink-muted hover:text-ink">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
