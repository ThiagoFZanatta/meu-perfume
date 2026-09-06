import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RequireRole } from "@/components/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/vendedor")({
  component: () => (
    <RequireRole role="vendedor">
      <VendedorShell />
    </RequireRole>
  ),
});

function VendedorShell() {
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <DashboardShell profile={profile} navItems={[]}>
      <Outlet />
    </DashboardShell>
  );
}
