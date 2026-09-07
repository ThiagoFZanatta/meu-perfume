import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Product = Pick<
  Tables<"products">,
  | "id"
  | "name"
  | "brand"
  | "image_url"
  | "ml"
  | "stock_quantity"
  | "current_sale_price"
  | "current_unit_cost_brl"
  | "last_purchase_date"
>;

function useStockProducts() {
  return useQuery({
    queryKey: ["estoque", "produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, brand, image_url, ml, stock_quantity, current_sale_price, current_unit_cost_brl, last_purchase_date",
        )
        .eq("active", true)
        .order("stock_quantity", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

// Tela 7 (RF05, master): consulta rápida de estoque, distinta do Catálogo
// (Tela 4, que é cadastro/edição) — mesma base de dados (`products`), mas
// colunas e propósito diferentes: aqui é "o que tenho disponível, a que
// custo e com que margem", numa única linha por produto, sem entrar na tela
// de edição. Master vê custo/margem/última compra; a visão do vendedor para
// esta mesma tela (nome, imagem, ml, quantidade, preço) já é coberta pelo
// Dashboard Vendedor (Tela 3, RF10 via products_catalog_v) — ver decisão no
// PROGRESSO.md sobre não duplicar uma segunda tela para o vendedor.
export function StockPanel() {
  const products = useStockProducts();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q),
    );
  }, [products.data, search]);

  if (products.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (products.isError) {
    return <p className="text-danger">Falha ao carregar o estoque.</p>;
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Buscar por nome ou marca..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {products.data.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhum produto em estoque.</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Nenhum produto encontrado para esse filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead />
                <TableHead className="text-right">ML</TableHead>
                <TableHead className="text-right">Estoque</TableHead>
                <TableHead className="text-right">Preço de venda</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead>Última compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const margemPercent =
                  p.current_sale_price != null &&
                  p.current_unit_cost_brl != null &&
                  p.current_unit_cost_brl > 0
                    ? ((p.current_sale_price - p.current_unit_cost_brl) / p.current_unit_cost_brl) *
                      100
                    : null;

                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.brand}</p>
                        </div>
                        {p.stock_quantity <= 1 && (
                          <span className="shrink-0 rounded-md bg-warning/10 px-1.5 py-0.5 text-xs font-medium text-warning">
                            estoque baixo
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{p.ml}</TableCell>
                    <TableCell className="tabular text-right">{p.stock_quantity}</TableCell>
                    <TableCell className="tabular text-right">
                      {p.current_sale_price != null ? `R$ ${p.current_sale_price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {p.current_unit_cost_brl != null
                        ? `R$ ${p.current_unit_cost_brl.toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {margemPercent != null ? `${margemPercent.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {p.last_purchase_date
                        ? new Date(`${p.last_purchase_date}T00:00:00`).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
