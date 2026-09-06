import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/require-role";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/master")({
  component: () => (
    <RequireRole role="master">
      <MasterDashboard />
    </RequireRole>
  ),
});

const NAV_ITEMS = [
  "Catálogo",
  "Compras",
  "Estoque",
  "Vendas",
  "Encomendas",
  "Relatórios",
  "Usuários",
];

function useMasterSummary() {
  return useQuery({
    queryKey: ["dashboard", "master", "summary"],
    queryFn: async () => {
      const [productsRes, lowStockRes, ordersRes] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true),
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("active", true)
          .lte("stock_quantity", 1),
        supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "aberto"),
      ]);
      return {
        totalProducts: productsRes.count ?? 0,
        lowStock: lowStockRes.count ?? 0,
        openOrders: ordersRes.count ?? 0,
      };
    },
  });
}

function MasterDashboard() {
  const { profile } = useAuth();
  const summary = useMasterSummary();

  if (!profile) return null;

  const hasData = (summary.data?.totalProducts ?? 0) > 0;

  return (
    <DashboardShell profile={profile} navItems={NAV_ITEMS}>
      <h2 className="font-display text-2xl font-medium">Visão geral</h2>

      {summary.isPending ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : summary.isError ? (
        <p className="mt-6 text-danger">Não foi possível carregar os dados. Tente novamente.</p>
      ) : !hasData ? (
        <div className="mt-6 rounded-xl border border-hairline bg-card p-8 text-center">
          <p className="text-foreground">Nenhuma compra registrada ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o primeiro produto para começar a controlar estoque e compras.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Produtos em estoque" value={summary.data!.totalProducts} />
          <SummaryCard
            label="Estoque baixo (≤1 un.)"
            value={summary.data!.lowStock}
            warnIfPositive
          />
          <SummaryCard label="Encomendas em aberto" value={summary.data!.openOrders} />
        </div>
      )}
    </DashboardShell>
  );
}

function SummaryCard({
  label,
  value,
  warnIfPositive,
}: {
  label: string;
  value: number;
  warnIfPositive?: boolean;
}) {
  const isWarning = warnIfPositive && value > 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`font-display tabular text-3xl ${isWarning ? "text-warning" : "text-foreground"}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
