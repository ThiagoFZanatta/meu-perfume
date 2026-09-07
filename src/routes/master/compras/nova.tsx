import { createFileRoute, Link } from "@tanstack/react-router";

import { PurchaseForm } from "@/components/purchase-form";

export const Route = createFileRoute("/master/compras/nova")({
  component: NovaCompraPage,
});

function NovaCompraPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium">Registrar compra</h2>
        <Link to="/master/compras/corrigir" className="text-sm text-muted-foreground underline">
          Ver, corrigir ou excluir compras já registradas
        </Link>
      </div>
      <div className="mt-6">
        <PurchaseForm />
      </div>
    </div>
  );
}
