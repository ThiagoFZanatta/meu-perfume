import { createFileRoute } from "@tanstack/react-router";

import { CashFlowReport } from "@/components/cash-flow-report";

export const Route = createFileRoute("/master/fluxo-caixa")({
  component: FluxoCaixaPage,
});

function FluxoCaixaPage() {
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-medium">Fluxo de Caixa</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Extrato cronológico de entradas e saídas, com saldo acumulado.
      </p>
      <CashFlowReport />
    </div>
  );
}
