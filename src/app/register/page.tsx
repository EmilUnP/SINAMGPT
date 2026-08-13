import { Suspense } from "react";
import { AuthForm } from "@/components/auth";
import { LoadingFallback } from "@/components/LoadingFallback";

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
