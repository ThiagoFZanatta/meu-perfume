import { createFileRoute } from "@tanstack/react-router";

import { PurchaseForm } from "@/components/purchase-form";

export const Route = createFileRoute("/master/compras/nova")({
  component: NovaCompraPage,
});

function NovaCompraPage() {
  return (
    <div>
      <h2 className="font-display text-2xl font-medium">Registrar compra</h2>
      <div className="mt-6">
        <PurchaseForm />
      </div>
    </div>
  );
}
