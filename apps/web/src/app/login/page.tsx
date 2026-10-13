import { redirect } from "next/navigation";
import { getEnv } from "@contrib/core/env";
import { getDb, getState } from "@contrib/core/db";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reconnect?: string }>;
}) {
  const env = getEnv();
  if (!env.authEnabled) redirect("/");
  const { error, reconnect } = await searchParams;
  const last = error
    ? await getDb()
        .then((db) =>
          getState<{ at: string; type: string; message: string }>(db, "state.lastAuthError"),
        )
        .catch(() => null)
    : null;
  const recent = last && Date.now() - Date.parse(last.at) < 10 * 60_000 ? last : null;
  async function signInAction() {
    "use server";
    const { signIn } = await import("@/server/auth");
    await signIn("github", { redirectTo: "/" });
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="hero-surface card w-full max-w-sm px-8 py-10 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-6 text-[22px] font-semibold">
          {reconnect ? "Reconnect GitHub" : "Welcome back"}
        </h1>
        <p className="text-ink-muted mt-2 font-serif text-[15px]">
          Every issue, PR, review and CI result you're involved in — kept up to date automatically.
        </p>
        {error ? (
          <p
            role="alert"
            className="bg-danger-bg text-danger-fg mt-4 rounded-[10px] px-3 py-2 text-[13px]"
          >
            {error === "AccessDenied"
              ? `Only @${env.ALLOWED_GITHUB_LOGIN} can sign in to this instance.`
              : `Sign-in failed (${error}${recent ? ` · ${recent.type}: ${recent.message}` : ""}). Try again.`}
          </p>
        ) : null}
        <form action={signInAction} className="mt-6">
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Continue with GitHub
          </Button>
        </form>
        <p className="text-ink-subtle mt-4 text-[12px]">
          Single-user instance · scopes: {env.githubScopes.join(", ")}
        </p>
      </div>
    </main>
  );
}
