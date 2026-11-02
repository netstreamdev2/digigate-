import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "./database";

/** The signed-in person's client for this request. Row level security decides what it can reach. */
export async function supabaseServer() {
  // Everything behind a login is live, so none of it can be prerendered.
  await connection();
  const store = await cookies();
  return createServerClient<Database, "digigate">(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      db: { schema: "digigate" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          // A page can't set cookies, only actions can. The proxy refreshes the session on every request regardless.
          try {
            items.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            return;
          }
        },
      },
    },
  );
}
