import { createFileRoute, Link } from "@tanstack/react-router";

import { SaleReturnPanel } from "@/components/sale-return-panel";

export const Route = createFileRoute("/master/vendas/devolucao")({
  component: DevolucaoPage,
});

function DevolucaoPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium">Devolução de venda</h2>
        <Link to="/master/vendas/historico" className="text-sm text-muted-foreground underline">
          Ver histórico completo de vendas
        </Link>
      </div>
      <SaleReturnPanel />
    </div>
  );
}
