import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ProductGender, Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/master/catalogo/")({
  component: CatalogoPage,
});

type Product = Tables<"products">;

function useProducts() {
  return useQuery({
    queryKey: ["catalogo", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("stock_quantity", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function CatalogoPage() {
  const products = useProducts();
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState<ProductGender | "todos">("todos");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (gender !== "todos" && p.gender !== gender) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [products.data, search, gender, showInactive]);

  const totalCadastrados = products.data?.length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-medium">Catálogo</h2>
        <Button asChild>
          <Link to="/master/catalogo/novo">Novo Produto</Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome ou marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={gender} onValueChange={(v) => setGender(v as ProductGender | "todos")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os gêneros</SelectItem>
            <SelectItem value="masculino">Masculino</SelectItem>
            <SelectItem value="feminino">Feminino</SelectItem>
            <SelectItem value="unissex">Unissex</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inativos
        </label>
      </div>

      <div className="mt-6">
        {products.isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : products.isError ? (
          <p className="text-danger">Falha ao carregar o catálogo. Tente novamente.</p>
        ) : totalCadastrados === 0 ? (
          <div className="rounded-xl border border-hairline bg-card p-8 text-center">
            <p className="text-foreground">Nenhum produto cadastrado.</p>
            <Button asChild className="mt-4">
              <Link to="/master/catalogo/novo">Cadastrar o primeiro produto</Link>
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum produto encontrado para esse filtro.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to="/master/catalogo/$productId"
      params={{ productId: product.id }}
      className={cn(
        "flex gap-3 rounded-2xl border border-hairline bg-card p-3 transition-colors hover:border-wine/40",
        !product.active && "opacity-60",
      )}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-muted-foreground">
            sem foto
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{product.name}</p>
          {!product.active && (
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              inativo
            </span>
          )}
          {product.active && product.stock_quantity <= 1 && (
            <span className="shrink-0 rounded-md bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
              estoque baixo
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {product.brand} · {product.ml}ml
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm tabular">
          <span>
            Estoque: <strong>{product.stock_quantity}</strong>
          </span>
          <span>
            Custo:{" "}
            <strong>
              {product.current_unit_cost_brl != null
                ? `R$ ${product.current_unit_cost_brl.toFixed(2)}`
                : "sem compra"}
            </strong>
          </span>
          <span>
            Venda:{" "}
            <strong>
              {product.current_sale_price != null
                ? `R$ ${product.current_sale_price.toFixed(2)}`
                : "sem compra"}
            </strong>
          </span>
        </div>
      </div>
    </Link>
  );
}
