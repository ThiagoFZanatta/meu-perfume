import { createFileRoute } from "@tanstack/react-router";

import { StockPanel } from "@/components/stock-panel";

export const Route = createFileRoute("/master/estoque")({
  component: EstoquePage,
});

function EstoquePage() {
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-medium">Estoque</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Consulta rápida de estoque disponível, custo e margem — para editar um produto, use o
        Catálogo.
      </p>
      <StockPanel />
    </div>
  );
}
