import { createFileRoute, Link } from "@tanstack/react-router";

import { PurchaseCorrectionPanel } from "@/components/purchase-correction-panel";

export const Route = createFileRoute("/master/compras/corrigir")({
  component: CorrigirCompraPage,
});

function CorrigirCompraPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-medium">Corrigir compra</h2>
        <Link to="/master/compras/nova" className="text-sm text-muted-foreground underline">
          Registrar nova compra
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Corrige taxa de câmbio, frete e preços de uma compra já registrada, sem alterar quantidade
        nem produtos.
      </p>
      <div className="mt-6">
        <PurchaseCorrectionPanel />
      </div>
    </div>
  );
}
