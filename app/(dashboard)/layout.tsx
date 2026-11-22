import React from "react";
import { requireUser } from "@/lib/auth/require-user";

export const instant = false;

/**
 * Shared Protected Route-Group Layout.
 * Strictly guarantees server-side user verification for every protected route.
 * Redirects unauthenticated requests to /login before rendering child content.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return <>{children}</>;
}
