"use client";

import { Suspense } from "react";
import AdminChangeHistory from "@/components/admin/AdminChangeHistory";

export default function AdminHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="px-1 py-6 text-sm text-muted sm:px-0">
          Loading history…
        </div>
      }
    >
      <AdminChangeHistory />
    </Suspense>
  );
}
