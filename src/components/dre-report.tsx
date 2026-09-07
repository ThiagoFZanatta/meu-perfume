import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Sale = Pick<Tables<"sales">, "id" | "sale_date" | "total_amount" | "commission_amount">;
type SaleItem = Pick<
  Tables<"sale_items">,
  "sale_id" | "product_id" | "quantity" | "returned_quantity"
>;
type PurchaseItem = Pick<Tables<"purchase_items">, "product_id" | "quantity" | "unit_cost_brl">;
type Expense = Pick<Tables<"expenses">, "expense_date" | "amount">;

function useSalesInPeriod(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["dre", "vendas", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("sales").select("id, sale_date, total_amount, commission_amount");
      if (dateFrom) query = query.gte("sale_date", dateFrom);
      if (dateTo) query = query.lte("sale_date", `${dateTo}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Sale[];
    },
  });
}

// Todo o histórico de itens vendidos (não filtrado por período): a filtragem
// por período acontece depois, casando pelo `sale_id` das vendas já
// filtradas em `useSalesInPeriod` — evita uma segunda condição de data
// duplicada (a data que importa é a da venda, não a do item).
function useAllSaleItems() {
  return useQuery({
    queryKey: ["dre", "itens-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("sale_id, product_id, quantity, returned_quantity");
      if (error) throw error;
      return data as SaleItem[];
    },
  });
}

// Todo o histórico de compras (sem filtro de período), usado só para compor o
// custo médio ponderado por produto — ver decisão de RF12 no PROGRESSO.md.
function useAllPurchaseItems() {
  return useQuery({
    queryKey: ["dre", "itens-compra-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_items")
        .select("product_id, quantity, unit_cost_brl");
      if (error) throw error;
      return data as PurchaseItem[];
    },
  });
}

function useExpensesInPeriod(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["dre", "despesas", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("expenses").select("expense_date, amount");
      if (dateFrom) query = query.gte("expense_date", dateFrom);
      if (dateTo) query = query.lte("expense_date", dateTo);
      const { data, error } = await query;
      if (error) throw error;
      return data as Expense[];
    },
  });
}

// Tela "DRE" (RF12, Fase 2, master-only): sem RPC/view nova — mesmo espírito
// de `stock-turnover-report.tsx` (RF09), os dados já liberados por RLS a
// `is_master()` são agregados no cliente.
//
// Custo médio ponderado (RF12, critério de aceite): o PRD define a fórmula
// por produto — `Σ(quantidade_do_lote × custo_unitário_do_lote) ÷
// quantidade_total_comprada` — mas deixa em aberto (com "ou") se a base do
// cálculo é "as compras do período" ou "o estoque consumido". Decisão
// adotada aqui: o custo médio de cada produto é calculado sobre TODO o
// histórico de compras dele (não só as do período filtrado). Duas razões:
// (1) uma venda no período normalmente consome estoque comprado em períodos
// anteriores, então restringir a média às compras do próprio período misturaria
// unidades comparadas ao custo errado; (2) evita divisão por zero num período
// em que o produto vendeu mas não foi comprado de novo. O CMV do período é
// então `Σ custo_médio[produto] × quantidade_líquida_vendida_no_período[produto]`
// — a variação cambial de compra a compra já fica diluída na média, que é o
// objetivo declarado do RF12 ("reduzir a distorção causada por variação
// cambial entre compras").
export function DreReport() {
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(today), "yyyy-MM-dd"));

  const sales = useSalesInPeriod(dateFrom, dateTo);
  const saleItems = useAllSaleItems();
  const purchaseItems = useAllPurchaseItems();
  const expenses = useExpensesInPeriod(dateFrom, dateTo);

  const isLoading =
    sales.isPending || saleItems.isPending || purchaseItems.isPending || expenses.isPending;
  const isError = sales.isError || saleItems.isError || purchaseItems.isError || expenses.isError;

  const result = useMemo(() => {
    if (!sales.data || !saleItems.data || !purchaseItems.data || !expenses.data) return null;

    const avgCostByProduct = new Map<string, number>();
    const totalsByProduct = new Map<string, { qty: number; cost: number }>();
    for (const item of purchaseItems.data) {
      const current = totalsByProduct.get(item.product_id) ?? { qty: 0, cost: 0 };
      current.qty += item.quantity;
      current.cost += item.quantity * item.unit_cost_brl;
      totalsByProduct.set(item.product_id, current);
    }
    for (const [productId, totals] of totalsByProduct) {
      avgCostByProduct.set(productId, totals.qty > 0 ? totals.cost / totals.qty : 0);
    }

    const saleIdsInPeriod = new Set(sales.data.map((s) => s.id));
    const netQtyByProduct = new Map<string, number>();
    for (const item of saleItems.data) {
      if (!saleIdsInPeriod.has(item.sale_id)) continue;
      const netQty = item.quantity - item.returned_quantity;
      netQtyByProduct.set(item.product_id, (netQtyByProduct.get(item.product_id) ?? 0) + netQty);
    }

    let cmv = 0;
    for (const [productId, qty] of netQtyByProduct) {
      cmv += (avgCostByProduct.get(productId) ?? 0) * qty;
    }

    const receita = sales.data.reduce((sum, s) => sum + s.total_amount, 0);
    const comissoes = sales.data.reduce((sum, s) => sum + s.commission_amount, 0);
    const despesas = expenses.data.reduce((sum, e) => sum + e.amount, 0);
    const resultadoLiquido = receita - cmv - comissoes - despesas;

    return { receita, cmv, comissoes, despesas, resultadoLiquido };
  }, [sales.data, saleItems.data, purchaseItems.data, expenses.data]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (isError || !result) {
    return <p className="text-danger">Falha ao processar o DRE.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="dre-date-from">Período de</Label>
          <Input
            id="dre-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dre-date-to">até</Label>
          <Input
            id="dre-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <dl className="divide-y divide-hairline rounded-xl border border-hairline">
        <Row label="Receita de vendas" value={result.receita} />
        <Row label="(–) Custo da mercadoria vendida (CMV)" value={-result.cmv} />
        <Row label="(–) Comissões" value={-result.comissoes} />
        <Row label="(–) Despesas gerais" value={-result.despesas} />
        <Row label="(=) Resultado líquido" value={result.resultadoLiquido} emphasis />
      </dl>
    </div>
  );
}

function Row({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${emphasis ? "bg-muted/40" : ""}`}>
      <dt className={emphasis ? "font-display font-medium" : "text-sm"}>{label}</dt>
      <dd
        className={`tabular ${emphasis ? "font-display text-lg font-medium" : "text-sm"} ${
          value < 0 ? "text-danger" : ""
        }`}
      >
        R$ {value.toFixed(2)}
      </dd>
    </div>
  );
}
