import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SellerRecentSales } from "@/components/seller-recent-sales";

export const Route = createFileRoute("/vendedor/")({
  component: VendedorDashboard,
});

function useCatalog() {
  return useQuery({
    queryKey: ["dashboard", "vendedor", "catalog"],
    queryFn: async () => {
      // Usa a view products_catalog_v (RF10): expõe apenas colunas seguras,
      // sem custo/margem, mesmo que o vendedor chame a API diretamente.
      const { data, error } = await supabase
        .from("products_catalog_v")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

function VendedorDashboard() {
  const [search, setSearch] = useState("");
  const catalog = useCatalog();

  const filtered = useMemo(() => {
    const list = catalog.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
    );
  }, [catalog.data, search]);

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button size="lg" className="h-14 text-base" asChild>
          <Link to="/vendedor/vendas/nova">Registrar Venda</Link>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base"
          onClick={() => toast("Em breve")}
        >
          Cadastrar Encomenda
        </Button>
      </div>

      <div className="mt-6">
        <Input
          placeholder="Buscar por nome ou marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4 divide-y divide-hairline">
        {catalog.isPending ? (
          <div className="space-y-2 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : catalog.isError ? (
          <p className="py-8 text-center text-danger">Falha ao carregar o estoque.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Nenhum produto cadastrado ainda.</p>
        ) : (
          filtered.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-muted-foreground">
                  {p.brand} · {p.ml}ml
                </p>
              </div>
              <div className="flex items-center gap-3">
                {p.stock_quantity <= 1 && (
                  <span className="rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                    estoque baixo
                  </span>
                )}
                <span className="tabular font-medium">
                  {p.stock_quantity} un. · R$ {p.current_sale_price.toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <SellerRecentSales />
    </div>
  );
}
