import { createFileRoute } from "@tanstack/react-router";

import { ExpensesPanel } from "@/components/expenses-panel";

export const Route = createFileRoute("/master/despesas")({
  component: DespesasPage,
});

function DespesasPage() {
  return (
    <div>
      <h2 className="mb-1 font-display text-2xl font-medium">Despesas</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Lançamento de despesas gerais (aluguel, taxa de máquina, outras), usadas no DRE e no fluxo
        de caixa.
      </p>
      <ExpensesPanel />
    </div>
  );
}
