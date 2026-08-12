import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--home-muted)]">
          Loading…
        </div>
      }
    >
      <AuthForm mode="register" />
    </Suspense>
  );
}
