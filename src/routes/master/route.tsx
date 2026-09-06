import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RequireRole } from "@/components/require-role";
import { DashboardShell, type NavItem } from "@/components/dashboard-shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/master")({
  component: () => (
    <RequireRole role="master">
      <MasterShell />
    </RequireRole>
  ),
});

const NAV_ITEMS: NavItem[] = [
  { label: "Catálogo", to: "/master/catalogo" },
  { label: "Compras", to: "/master/compras/nova" },
  { label: "Estoque" },
  { label: "Vendas" },
  { label: "Encomendas" },
  { label: "Relatórios" },
  { label: "Usuários" },
];

function MasterShell() {
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <DashboardShell profile={profile} navItems={NAV_ITEMS}>
      <Outlet />
    </DashboardShell>
  );
}
