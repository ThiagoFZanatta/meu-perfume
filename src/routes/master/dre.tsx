import { createFileRoute } from "@tanstack/react-router";

import { DreReport } from "@/components/dre-report";

export const Route = createFileRoute("/master/dre")({
  component: DrePage,
});

function DrePage() {
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-medium">DRE</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Receita, custo da mercadoria vendida, comissões e despesas do período selecionado.
      </p>
      <DreReport />
    </div>
  );
}
