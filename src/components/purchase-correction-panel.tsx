import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Purchase = Tables<"purchases">;
type PurchaseItem = Tables<"purchase_items">;
type Product = Pick<
  Tables<"products">,
  "id" | "name" | "brand" | "current_sale_price" | "last_purchase_date" | "markup_percent"
>;

function useProducts() {
  return useQuery({
    queryKey: ["correcao-compra", "produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, current_sale_price, last_purchase_date, markup_percent");
      if (error) throw error;
      return data as Product[];
    },
  });
}

function usePurchases(filters: { dateFrom: string; dateTo: string }) {
  return useQuery({
    queryKey: ["correcao-compra", "compras", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchases")
        .select("*")
        .order("purchase_date", { ascending: false })
        .limit(50);
      if (filters.dateFrom) query = query.gte("purchase_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("purchase_date", filters.dateTo);
      const { data, error } = await query;
      if (error) throw error;
      return data as Purchase[];
    },
  });
}

function useItemsByPurchase(purchaseIds: string[]) {
  return useQuery({
    queryKey: ["correcao-compra", "itens-por-compras", purchaseIds],
    queryFn: async () => {
      if (purchaseIds.length === 0) return [] as PurchaseItem[];
      const { data, error } = await supabase
        .from("purchase_items")
        .select("*")
        .in("purchase_id", purchaseIds);
      if (error) throw error;
      return data as PurchaseItem[];
    },
    enabled: purchaseIds.length > 0,
  });
}

// RF13 — revisão pós-PR #5: delete_purchase() bloqueia (corretamente) a exclusão
// de uma compra que já teve parte do estoque vendido depois dela, e aí não sobra
// nenhuma forma de corrigi-la. Excluir + relançar continua sendo o fluxo padrão
// de correção (não há tela de edição genérica); esta tela é a exceção só para
// compras, e só para os campos que não mexem em quantidade/estoque (taxa de
// câmbio, frete, preço unitário em USD) — por isso nunca esbarra naquela trava.
// O preço de venda não é mais editado aqui: update_purchase_pricing() sempre
// RECOMPÕE o preço vigente do produto (quando esta é a compra mais recente
// dele) a partir do novo custo × markup_percent do produto, no banco — a coluna
// "novo preço sugerido" abaixo é só uma prévia do que o backend vai calcular.
// Ver PROGRESSO.md para a limitação aceita sobre por que o preço de venda é
// recomposto, e não recuperado literalmente (o schema não guarda histórico de
// preço de venda confirmado por compra, só de custo).
//
// Esta tela também é o único ponto de entrada de `delete_purchase()` (RF13): a
// busca por data/produto já a torna, na prática, a listagem de compras que
// faltava (RF04) — não há necessidade de uma tela separada só para isso.
export function PurchaseCorrectionPanel() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const products = useProducts();
  const purchases = usePurchases({ dateFrom, dateTo });

  const purchaseIds = useMemo(() => (purchases.data ?? []).map((p) => p.id), [purchases.data]);
  const items = useItemsByPurchase(purchaseIds);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) map.set(p.id, p);
    return map;
  }, [products.data]);

  const itemsByPurchase = useMemo(() => {
    const map = new Map<string, PurchaseItem[]>();
    for (const item of items.data ?? []) {
      const list = map.get(item.purchase_id) ?? [];
      list.push(item);
      map.set(item.purchase_id, list);
    }
    return map;
  }, [items.data]);

  const filteredPurchases = useMemo(() => {
    const list = purchases.data ?? [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((purchase) =>
      (itemsByPurchase.get(purchase.id) ?? []).some((item) => {
        const product = productMap.get(item.product_id);
        if (!product) return false;
        return product.name.toLowerCase().includes(q) || product.brand.toLowerCase().includes(q);
      }),
    );
  }, [purchases.data, itemsByPurchase, productMap, productSearch]);

  function invalidateAfterMutation() {
    void queryClient.invalidateQueries({ queryKey: ["correcao-compra"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "vendedor", "catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "master", "summary"] });
    void queryClient.invalidateQueries({ queryKey: ["compras", "produtos-ativos"] });
    void queryClient.invalidateQueries({ queryKey: ["vendas", "produtos-ativos"] });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="filter-date-from">De</Label>
          <Input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-date-to">Até</Label>
          <Input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-product">Produto</Label>
          <Input
            id="filter-product"
            placeholder="Nome ou marca..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
        </div>
      </div>

      {purchases.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : purchases.isError ? (
        <p className="text-danger">Falha ao carregar as compras.</p>
      ) : filteredPurchases.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhuma compra encontrada.</p>
      ) : (
        <div className="space-y-3">
          {filteredPurchases.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              items={itemsByPurchase.get(purchase.id) ?? []}
              productMap={productMap}
              expanded={expandedPurchaseId === purchase.id}
              onToggle={() =>
                setExpandedPurchaseId(expandedPurchaseId === purchase.id ? null : purchase.id)
              }
              onMutated={invalidateAfterMutation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ItemEdit = { unitPriceUsd: string };

function PurchaseRow({
  purchase,
  items,
  productMap,
  expanded,
  onToggle,
  onMutated,
}: {
  purchase: Purchase;
  items: PurchaseItem[];
  productMap: Map<string, Product>;
  expanded: boolean;
  onToggle: () => void;
  onMutated: () => void;
}) {
  const [exchangeRate, setExchangeRate] = useState(String(purchase.exchange_rate));
  const [freightCostBrl, setFreightCostBrl] = useState(String(purchase.freight_cost_brl));
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>(() =>
    Object.fromEntries(
      items.map((item) => [item.product_id, { unitPriceUsd: String(item.unit_price_usd) }]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const exchangeRateNum = Number(exchangeRate) || 0;
  const freightPerUnit = totalQuantity > 0 ? (Number(freightCostBrl) || 0) / totalQuantity : 0;

  function computedUnitCost(item: PurchaseItem) {
    const unitPriceUsd = Number(itemEdits[item.product_id]?.unitPriceUsd) || 0;
    return Math.round((unitPriceUsd * exchangeRateNum + freightPerUnit) * 100) / 100;
  }

  // Só uma prévia: o preço de venda de fato é sempre recomposto pelo backend
  // (custo × markup_percent do produto), nunca digitado aqui — ver comentário
  // no topo do arquivo.
  function suggestedSalePrice(item: PurchaseItem) {
    const markup = productMap.get(item.product_id)?.markup_percent ?? 0;
    return Math.round(computedUnitCost(item) * (1 + markup / 100) * 100) / 100;
  }

  const newTotalCost = items.reduce((sum, item) => sum + computedUnitCost(item) * item.quantity, 0);

  const isValid =
    exchangeRateNum > 0 &&
    (Number(freightCostBrl) || 0) >= 0 &&
    items.every((item) => Number(itemEdits[item.product_id]?.unitPriceUsd) > 0);

  async function handleSubmit() {
    if (!isValid) {
      setError("Preencha taxa de câmbio, frete e o preço em USD de cada item corretamente.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payloadItems = items.map((item) => ({
      product_id: item.product_id,
      unit_price_usd: Number(itemEdits[item.product_id]?.unitPriceUsd),
    }));

    const { error: rpcError } = await supabase.rpc("update_purchase_pricing", {
      p_purchase_id: purchase.id,
      p_exchange_rate: exchangeRateNum,
      p_freight_cost_brl: Number(freightCostBrl) || 0,
      p_items: payloadItems,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    toast.success(`Compra corrigida. Novo total: R$ ${newTotalCost.toFixed(2)}`);
    onMutated();
  }

  // RF13 — delete_purchase() (backend desde a seção 15 do PROGRESSO) bloqueia
  // (raise exception) quando reverter o estoque da compra deixaria algum
  // produto negativo — ex.: parte do lote já foi vendida depois da compra.
  // Não há como saber isso de antemão sem repetir a mesma conta do backend, então
  // o botão fica sempre habilitado e a mensagem de erro, quando houver, vem
  // diretamente do `raise exception` do banco.
  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("delete_purchase", {
      p_purchase_id: purchase.id,
    });
    setDeleting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    toast.success("Compra excluída e estoque revertido.");
    onMutated();
  }

  return (
    <div className="rounded-xl border border-hairline">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div>
          <p className="tabular text-sm font-medium">R$ {purchase.total_cost_brl.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(purchase.purchase_date).toLocaleDateString("pt-BR")} · câmbio{" "}
            {purchase.exchange_rate.toFixed(4)} · frete R$ {purchase.freight_cost_brl.toFixed(2)}
          </p>
        </div>
        {purchase.updated_at && <Badge variant="secondary">corrigida</Badge>}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-hairline p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor={`exchange-${purchase.id}`}>Taxa de câmbio (USD→BRL) *</Label>
              <Input
                id={`exchange-${purchase.id}`}
                type="number"
                min="0"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`freight-${purchase.id}`}>Frete total (R$)</Label>
              <Input
                id={`freight-${purchase.id}`}
                type="number"
                min="0"
                step="0.01"
                value={freightCostBrl}
                onChange={(e) => setFreightCostBrl(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Preço unit. (USD)</TableHead>
                  <TableHead className="text-right">Custo unit. (R$)</TableHead>
                  <TableHead className="text-right">Novo preço sugerido (R$)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = productMap.get(item.product_id);
                  const isLatestForProduct = product?.last_purchase_date === purchase.purchase_date;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        {product ? `${product.name} · ${product.brand}` : item.product_id}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {item.quantity}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="tabular text-right"
                          value={itemEdits[item.product_id]?.unitPriceUsd ?? ""}
                          onChange={(e) =>
                            setItemEdits((prev) => ({
                              ...prev,
                              [item.product_id]: { unitPriceUsd: e.target.value },
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {computedUnitCost(item).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="tabular text-muted-foreground">
                          {suggestedSalePrice(item).toFixed(2)}
                        </p>
                        {!isLatestForProduct && (
                          <p className="text-xs text-muted-foreground">
                            há compra mais recente — só atualiza o histórico
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            O preço de venda do produto não é digitado aqui — é recomposto automaticamente pelo
            sistema (custo × markup do produto) quando esta é a compra mais recente dele.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <p className="tabular text-sm text-muted-foreground">
              Novo total da compra:{" "}
              <strong className="text-foreground">R$ {newTotalCost.toFixed(2)}</strong>
            </p>
            <Button type="button" onClick={handleSubmit} disabled={submitting || !isValid}>
              {submitting ? "Salvando..." : "Salvar correção"}
            </Button>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end border-t border-hairline pt-3">
            <ConfirmDeleteButton
              triggerLabel="Excluir compra"
              pendingLabel="Excluindo..."
              pending={deleting}
              className="text-danger hover:text-danger"
              title="Excluir esta compra?"
              description="O estoque comprado nela será revertido e o custo/preço vigente do produto pode voltar para o de uma compra anterior. Esta ação não pode ser desfeita."
              onConfirm={handleDelete}
            />
          </div>
        </div>
      )}
    </div>
  );
}
