import { createFileRoute } from "@tanstack/react-router";

import { OrdersPanel } from "@/components/orders-panel";

export const Route = createFileRoute("/vendedor/encomendas")({
  component: EncomendasPage,
});

function EncomendasPage() {
  return (
    <div>
      <h2 className="mb-6 font-display text-2xl font-medium">Encomendas</h2>
      <OrdersPanel />
    </div>
  );
}
