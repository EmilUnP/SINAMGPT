import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--home-muted)]">
          Loading…
        </div>
      }
    >
      <AuthForm mode="login" />
    </Suspense>
  );
}
