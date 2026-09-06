import { createFileRoute } from "@tanstack/react-router";

import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/master/catalogo/novo")({
  component: NovoProdutoPage,
});

function NovoProdutoPage() {
  return (
    <div>
      <h2 className="font-display text-2xl font-medium">Novo produto</h2>
      <div className="mt-6">
        <ProductForm />
      </div>
    </div>
  );
}
