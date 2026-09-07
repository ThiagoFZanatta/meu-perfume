import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, subDays } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Product = Pick<
  Tables<"products_catalog_v">,
  "id" | "name" | "brand" | "stock_quantity" | "last_purchase_date"
>;
type Sale = Pick<Tables<"sales">, "id" | "sale_date">;
type SaleItem = Pick<
  Tables<"sale_items">,
  "sale_id" | "product_id" | "quantity" | "returned_quantity"
>;

const DEFAULT_STALE_DAYS = 30;

function useProducts() {
  return useQuery({
    queryKey: ["relatorios", "produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_catalog_v")
        .select("id, name, brand, stock_quantity, last_purchase_date")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

// Histórico completo (sem filtro de período): a data da última venda de cada
// produto é usada para decidir se ele está "parado" (RF09), o que é uma regra
// independente do filtro de período escolhido na tela (esse filtro afeta
// apenas a lista "mais vendidos" e o indicador de giro).
function useAllSales() {
  return useQuery({
    queryKey: ["relatorios", "vendas-todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sales").select("id, sale_date");
      if (error) throw error;
      return data as Sale[];
    },
  });
}

function useAllSaleItems() {
  return useQuery({
    queryKey: ["relatorios", "itens-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, quantity, returned_quantity");
      if (error) throw error;
      return data as SaleItem[];
    },
  });
}

function useStaleDaysSetting() {
  return useQuery({
    queryKey: ["relatorios", "stale-days"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "stale_product_days")
        .maybeSingle();
      if (error) throw error;
      const value = data?.value;
      return typeof value === "number" ? value : DEFAULT_STALE_DAYS;
    },
  });
}

type ProductStats = {
  product: Product;
  soldInPeriod: number;
  lastMovementDate: string | null;
  daysSinceMovement: number | null;
  isStale: boolean;
  daysInStock: number | null;
  turnover: number | null;
};

// Tela 10 (RF09, master): "parados" e "mais vendidos" a partir do histórico de
// `sales`/`purchases`. Sem RPC dedicada — como esta tela é 100% master
// (RLS já dá select livre em products/sales/sale_items para este papel), o
// cálculo é feito no cliente a partir dos dados já liberados pelo RLS, no
// mesmo espírito de outras telas do master que filtram/agrupam em JS
// (ex: purchase-correction-panel).
export function StockTurnoverReport() {
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(() => format(subDays(today, 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(today, "yyyy-MM-dd"));

  const products = useProducts();
  const sales = useAllSales();
  const saleItems = useAllSaleItems();
  const staleDays = useStaleDaysSetting();

  const isLoading =
    products.isPending || sales.isPending || saleItems.isPending || staleDays.isPending;
  const isError = products.isError || sales.isError || saleItems.isError || staleDays.isError;

  const stats = useMemo<ProductStats[]>(() => {
    if (!products.data || !sales.data || !saleItems.data || staleDays.data === undefined) return [];

    const saleDateById = new Map(sales.data.map((s) => [s.id, s.sale_date]));
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;

    const soldInPeriod = new Map<string, number>();
    const lastMovement = new Map<string, string>();

    for (const item of saleItems.data) {
      const saleDate = saleDateById.get(item.sale_id);
      if (!saleDate) continue;

      const current = lastMovement.get(item.product_id);
      if (!current || saleDate > current) lastMovement.set(item.product_id, saleDate);

      const saleTime = new Date(saleDate).getTime();
      if (saleTime >= fromTime && saleTime <= toTime) {
        const netQty = item.quantity - item.returned_quantity;
        soldInPeriod.set(item.product_id, (soldInPeriod.get(item.product_id) ?? 0) + netQty);
      }
    }

    return products.data.map((product) => {
      // "Parado" (RF09): sem venda há `staleDays` dias ou mais; se o produto
      // nunca vendeu, a contagem começa na última compra (entrada em estoque).
      const referenceDate = lastMovement.get(product.id) ?? product.last_purchase_date ?? null;
      const daysSinceMovement = referenceDate
        ? differenceInCalendarDays(today, new Date(referenceDate))
        : null;
      const isStale = daysSinceMovement !== null && daysSinceMovement >= staleDays.data;

      const daysInStock = product.last_purchase_date
        ? Math.max(differenceInCalendarDays(today, new Date(product.last_purchase_date)), 1)
        : null;
      const sold = soldInPeriod.get(product.id) ?? 0;
      const turnover = daysInStock ? Math.round((sold / daysInStock) * 1000) / 1000 : null;

      return {
        product,
        soldInPeriod: sold,
        lastMovementDate: referenceDate,
        daysSinceMovement,
        isStale,
        daysInStock,
        turnover,
      };
    });
  }, [products.data, sales.data, saleItems.data, staleDays.data, dateFrom, dateTo, today]);

  const staleProducts = useMemo(
    () =>
      stats
        .filter((s) => s.isStale)
        .sort((a, b) => (b.daysSinceMovement ?? 0) - (a.daysSinceMovement ?? 0)),
    [stats],
  );

  const bestSellers = useMemo(
    () =>
      stats
        .filter((s) => s.soldInPeriod > 0)
        .sort((a, b) => b.soldInPeriod - a.soldInPeriod)
        .slice(0, 10),
    [stats],
  );

  const maxSold = bestSellers[0]?.soldInPeriod ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-danger">Falha ao processar o relatório.</p>;
  }

  if (products.data.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Ainda não há dados suficientes para gerar este relatório.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="report-date-from">Período de</Label>
          <Input
            id="report-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-date-to">até</Label>
          <Input
            id="report-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-medium">Mais vendidos no período</h3>
        {bestSellers.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            Nenhuma venda registrada no período selecionado.
          </p>
        ) : (
          <div className="space-y-2 rounded-xl border border-hairline p-4">
            {bestSellers.map((s) => (
              <div key={s.product.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {s.product.name} · {s.product.brand}
                  </span>
                  <span className="tabular font-medium">{s.soldInPeriod} un.</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-wine"
                    style={{ width: `${maxSold > 0 ? (s.soldInPeriod / maxSold) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-display text-lg font-medium">
          Produtos parados (sem venda há {staleDays.data}+ dias)
        </h3>
        {staleProducts.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">
            Nenhum produto parado no momento.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-xl border border-hairline">
            {staleProducts.map((s) => (
              <li key={s.product.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {s.product.name} · {s.product.brand}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.lastMovementDate
                      ? `Sem movimento há ${s.daysSinceMovement} dias`
                      : "Sem histórico de venda ou compra"}
                  </p>
                </div>
                <span className="tabular text-sm text-muted-foreground">
                  {s.product.stock_quantity} un. em estoque
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
