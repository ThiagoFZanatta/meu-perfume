import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ProductForm } from "@/components/product-form";

export const Route = createFileRoute("/master/catalogo/$productId")({
  component: EditarProdutoPage,
});

function EditarProdutoPage() {
  const { productId } = Route.useParams();

  const product = useQuery({
    queryKey: ["products", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <h2 className="font-display text-2xl font-medium">Editar produto</h2>
      <div className="mt-6">
        {product.isPending ? (
          <div className="h-64 max-w-xl animate-pulse rounded-xl bg-muted" />
        ) : product.isError || !product.data ? (
          <p className="text-danger">Produto não encontrado.</p>
        ) : (
          <ProductForm product={product.data} />
        )}
      </div>
    </div>
  );
}
