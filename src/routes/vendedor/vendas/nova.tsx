import { createFileRoute } from "@tanstack/react-router";

import { SaleForm } from "@/components/sale-form";

export const Route = createFileRoute("/vendedor/vendas/nova")({
  component: NovaVendaPage,
});

function NovaVendaPage() {
  return (
    <div>
      <h2 className="mb-6 font-display text-2xl font-medium">Registrar venda</h2>
      <SaleForm />
    </div>
  );
}
