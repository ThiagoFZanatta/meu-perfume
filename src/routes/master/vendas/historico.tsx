import { createFileRoute, Link } from "@tanstack/react-router";

import { SalesHistoryPanel } from "@/components/sales-history-panel";

export const Route = createFileRoute("/master/vendas/historico")({
  component: HistoricoVendasPage,
});

function HistoricoVendasPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium">Histórico de Vendas</h2>
        <Link to="/master/vendas/devolucao" className="text-sm text-muted-foreground underline">
          Corrigir ou devolver uma venda
        </Link>
      </div>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Todas as vendas registradas, com filtro por vendedor, período e status.
      </p>
      <SalesHistoryPanel />
    </div>
  );
}
