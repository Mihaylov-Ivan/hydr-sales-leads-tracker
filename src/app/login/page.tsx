import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <p className="py-20 text-center text-sm text-muted">Loading…</p>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
