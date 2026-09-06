import { createFileRoute } from "@tanstack/react-router";

import { SaleReturnPanel } from "@/components/sale-return-panel";

export const Route = createFileRoute("/master/vendas/devolucao")({
  component: DevolucaoPage,
});

function DevolucaoPage() {
  return (
    <div>
      <h2 className="mb-6 font-display text-2xl font-medium">Devolução de venda</h2>
      <SaleReturnPanel />
    </div>
  );
}
