import { createFileRoute } from "@tanstack/react-router";

import { StockTurnoverReport } from "@/components/stock-turnover-report";

export const Route = createFileRoute("/master/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-medium">Relatórios de giro de estoque</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Produtos parados e mais vendidos, para orientar a próxima compra.
      </p>
      <StockTurnoverReport />
    </div>
  );
}
