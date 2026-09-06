import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Sale = Tables<"sales">;
type SaleItem = Tables<"sale_items">;
type Profile = Pick<Tables<"profiles">, "id" | "name" | "role">;
type Product = Pick<Tables<"products">, "id" | "name" | "brand">;

const PAYMENT_LABELS: Record<Sale["payment_method"], string> = {
  especie: "Espécie",
  debito: "Débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

const STATUS_LABELS: Record<Sale["status"], string> = {
  concluida: "Concluída",
  parcialmente_devolvida: "Parcialmente devolvida",
  totalmente_devolvida: "Totalmente devolvida",
};

function useSellers() {
  return useQuery({
    queryKey: ["devolucao", "vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, role")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });
}

function useProducts() {
  return useQuery({
    queryKey: ["devolucao", "produtos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, brand");
      if (error) throw error;
      return data as Product[];
    },
  });
}

function useSales(filters: { sellerId: string; dateFrom: string; dateTo: string }) {
  return useQuery({
    queryKey: ["devolucao", "vendas", filters],
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select("*")
        .order("sale_date", { ascending: false })
        .limit(50);
      if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
      if (filters.dateFrom) query = query.gte("sale_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("sale_date", `${filters.dateTo}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Sale[];
    },
  });
}

function useItemsBySale(saleIds: string[]) {
  return useQuery({
    queryKey: ["devolucao", "itens-por-vendas", saleIds],
    queryFn: async () => {
      if (saleIds.length === 0) return [] as SaleItem[];
      const { data, error } = await supabase.from("sale_items").select("*").in("sale_id", saleIds);
      if (error) throw error;
      return data as SaleItem[];
    },
    enabled: saleIds.length > 0,
  });
}

// Tela 12 (RF14, master) — busca a venda original (por vendedor/data/produto),
// permite devolver um ou mais itens (repõe estoque e estorna total/comissão
// proporcionalmente) e, como o master não tem limite de tempo para corrigir
// lançamentos (RF13), também expõe "Excluir venda" nesta mesma busca — não há
// tela separada de listagem/histórico de vendas ainda (pendência documentada,
// deferida para Relatórios/RF09).
export function SaleReturnPanel() {
  const [sellerId, setSellerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const sellers = useSellers();
  const products = useProducts();
  const sales = useSales({ sellerId, dateFrom, dateTo });

  const saleIds = useMemo(() => (sales.data ?? []).map((s) => s.id), [sales.data]);
  const items = useItemsBySale(saleIds);

  const sellerMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const s of sellers.data ?? []) map.set(s.id, s);
    return map;
  }, [sellers.data]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) map.set(p.id, p);
    return map;
  }, [products.data]);

  const itemsBySale = useMemo(() => {
    const map = new Map<string, SaleItem[]>();
    for (const item of items.data ?? []) {
      const list = map.get(item.sale_id) ?? [];
      list.push(item);
      map.set(item.sale_id, list);
    }
    return map;
  }, [items.data]);

  const filteredSales = useMemo(() => {
    const list = sales.data ?? [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((sale) =>
      (itemsBySale.get(sale.id) ?? []).some((item) => {
        const product = productMap.get(item.product_id);
        if (!product) return false;
        return product.name.toLowerCase().includes(q) || product.brand.toLowerCase().includes(q);
      }),
    );
  }, [sales.data, itemsBySale, productMap, productSearch]);

  function invalidateAfterMutation() {
    void queryClient.invalidateQueries({ queryKey: ["devolucao"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "vendedor", "catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "master", "summary"] });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="filter-seller">Vendedor</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger id="filter-seller">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              {(sellers.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.role === "master" ? " (master)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      {sales.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : sales.isError ? (
        <p className="text-danger">Falha ao carregar as vendas.</p>
      ) : filteredSales.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhuma venda encontrada.</p>
      ) : (
        <div className="space-y-3">
          {filteredSales.map((sale) => (
            <SaleRow
              key={sale.id}
              sale={sale}
              sellerName={sellerMap.get(sale.seller_id)?.name ?? "—"}
              items={itemsBySale.get(sale.id) ?? []}
              productMap={productMap}
              expanded={expandedSaleId === sale.id}
              onToggle={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)}
              onMutated={invalidateAfterMutation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SaleRow({
  sale,
  sellerName,
  items,
  productMap,
  expanded,
  onToggle,
  onMutated,
}: {
  sale: Sale;
  sellerName: string;
  items: SaleItem[];
  productMap: Map<string, Product>;
  expanded: boolean;
  onToggle: () => void;
  onMutated: () => void;
}) {
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commissionRatio = sale.total_amount > 0 ? sale.commission_amount / sale.total_amount : 0;

  const returnableItems = items.map((item) => {
    const available = item.quantity - item.returned_quantity;
    const qty = Math.min(Number(returnQty[item.id]) || 0, available);
    const refund =
      Math.round(item.unit_sale_price * qty * (1 - item.discount_percent / 100) * 100) / 100;
    return { item, available, qty, refund };
  });

  const totalRefund = returnableItems.reduce((sum, r) => sum + r.refund, 0);
  const commissionAdjustment = Math.round(totalRefund * commissionRatio * 100) / 100;
  const hasQtyToReturn = returnableItems.some((r) => r.qty > 0);
  const canDelete = sale.status === "concluida";

  async function handleReturn() {
    if (!hasQtyToReturn) {
      setError("Informe a quantidade a devolver em ao menos um item.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payloadItems = returnableItems
      .filter((r) => r.qty > 0)
      .map((r) => ({
        sale_item_id: r.item.id,
        quantity_returned: r.qty,
        reason: reason || undefined,
      }));

    const { error: rpcError } = await supabase.rpc("return_sale_items", {
      p_sale_id: sale.id,
      p_items: payloadItems,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    toast.success(`Devolução registrada. Estorno: R$ ${totalRefund.toFixed(2)}.`);
    setReturnQty({});
    setReason("");
    onMutated();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("delete_sale", { p_sale_id: sale.id });
    setDeleting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    toast.success("Venda excluída e estoque reposto.");
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
          <p className="tabular text-sm font-medium">R$ {sale.total_amount.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            {sellerName} · {PAYMENT_LABELS[sale.payment_method]} ·{" "}
            {new Date(sale.sale_date).toLocaleString("pt-BR")}
          </p>
        </div>
        <Badge variant={sale.status === "concluida" ? "outline" : "secondary"}>
          {STATUS_LABELS[sale.status]}
        </Badge>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-hairline p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Já devolvido</TableHead>
                  <TableHead className="text-right">Disponível</TableHead>
                  <TableHead className="text-right">Devolver agora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const product = productMap.get(item.product_id);
                  const available = item.quantity - item.returned_quantity;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        {product ? `${product.name} · ${product.brand}` : item.product_id}
                      </TableCell>
                      <TableCell className="tabular text-right">{item.quantity}</TableCell>
                      <TableCell className="tabular text-right">{item.returned_quantity}</TableCell>
                      <TableCell className="tabular text-right">{available}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          max={available}
                          step="1"
                          className="tabular ml-auto w-24 text-right"
                          value={returnQty[item.id] ?? ""}
                          disabled={available === 0}
                          onChange={(e) =>
                            setReturnQty((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`reason-${sale.id}`}>Motivo da devolução (opcional)</Label>
            <Textarea
              id={`reason-${sale.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <p className="tabular text-sm text-muted-foreground">
              Valor a estornar:{" "}
              <strong className="text-foreground">R$ {totalRefund.toFixed(2)}</strong> · Ajuste de
              comissão:{" "}
              <strong className="text-foreground">R$ {commissionAdjustment.toFixed(2)}</strong>
            </p>
            <Button type="button" onClick={handleReturn} disabled={submitting || !hasQtyToReturn}>
              {submitting ? "Confirmando..." : "Confirmar Devolução"}
            </Button>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end border-t border-hairline pt-3">
            <Button
              type="button"
              variant="ghost"
              className="text-danger hover:text-danger"
              disabled={!canDelete || deleting}
              onClick={handleDelete}
              title={!canDelete ? "Venda já devolvida — não pode mais ser excluída" : undefined}
            >
              {deleting ? "Excluindo..." : "Excluir venda"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
