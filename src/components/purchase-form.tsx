import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Product = Pick<Tables<"products">, "id" | "name" | "brand" | "markup_percent">;

type ItemRow = {
  key: string;
  productId: string;
  quantity: string;
  unitPriceUsd: string;
  salePrice: string;
  salePriceTouched: boolean;
};

function emptyRow(): ItemRow {
  return {
    key: crypto.randomUUID(),
    productId: "",
    quantity: "",
    unitPriceUsd: "",
    salePrice: "",
    salePriceTouched: false,
  };
}

function useActiveProducts() {
  return useQuery({
    queryKey: ["compras", "produtos-ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, brand, markup_percent")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

// Registro de compra (Tela 6, RF04/RF06). Custo unitário e preço sugerido são
// recalculados no front só para exibição — o backend (`confirm_purchase`, RPC)
// recalcula tudo de novo antes de gravar, então a fonte da verdade é sempre o servidor.
export function PurchaseForm() {
  const navigate = useNavigate();
  const products = useActiveProducts();
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) map.set(p.id, p);
    return map;
  }, [products.data]);

  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exchangeRate, setExchangeRate] = useState("");
  const [freightCostBrl, setFreightCostBrl] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const freightPerUnit = totalQuantity > 0 ? (Number(freightCostBrl) || 0) / totalQuantity : 0;
  const exchangeRateNum = Number(exchangeRate) || 0;

  function computedUnitCost(item: ItemRow) {
    const unitPriceUsd = Number(item.unitPriceUsd) || 0;
    return Math.round((unitPriceUsd * exchangeRateNum + freightPerUnit) * 100) / 100;
  }

  function suggestedSalePrice(item: ItemRow) {
    const product = productMap.get(item.productId);
    if (!product) return 0;
    const unitCost = computedUnitCost(item);
    return Math.round(unitCost * (1 + product.markup_percent / 100) * 100) / 100;
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  }

  const totalCostBrl = items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    return sum + computedUnitCost(item) * quantity;
  }, 0);

  const isValid =
    Boolean(purchaseDate) &&
    exchangeRateNum > 0 &&
    items.length > 0 &&
    items.every((item) => {
      const quantity = Number(item.quantity);
      const unitPriceUsd = Number(item.unitPriceUsd);
      const salePrice = item.salePriceTouched ? Number(item.salePrice) : suggestedSalePrice(item);
      return Boolean(item.productId) && quantity > 0 && unitPriceUsd > 0 && salePrice > 0;
    });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) {
      setError("Preencha todos os campos obrigatórios de cada item antes de confirmar.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payloadItems = items.map((item) => ({
      product_id: item.productId,
      quantity: Number(item.quantity),
      unit_price_usd: Number(item.unitPriceUsd),
      sale_price: item.salePriceTouched ? Number(item.salePrice) : suggestedSalePrice(item),
    }));

    const { error: rpcError } = await supabase.rpc("confirm_purchase", {
      p_purchase_date: purchaseDate,
      p_exchange_rate: exchangeRateNum,
      p_freight_cost_brl: Number(freightCostBrl) || 0,
      p_items: payloadItems,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    toast.success(`Compra registrada. Total: R$ ${totalCostBrl.toFixed(2)}`);
    navigate({ to: "/master/catalogo" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:max-w-xl">
        <div className="space-y-1.5">
          <Label htmlFor="purchase-date">Data da compra *</Label>
          <Input
            id="purchase-date"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exchange-rate">Taxa de câmbio (USD→BRL) *</Label>
          <Input
            id="exchange-rate"
            type="number"
            min="0"
            step="0.0001"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="freight">Frete total (R$)</Label>
          <Input
            id="freight"
            type="number"
            min="0"
            step="0.01"
            value={freightCostBrl}
            onChange={(e) => setFreightCostBrl(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Produto</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Preço unit. (USD)</TableHead>
              <TableHead className="text-right">Custo unit. (R$)</TableHead>
              <TableHead className="text-right">Preço de venda (R$)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const suggested = suggestedSalePrice(item);
              const salePriceValue = item.salePriceTouched
                ? item.salePrice
                : suggested > 0
                  ? suggested.toFixed(2)
                  : "";
              return (
                <TableRow key={item.key}>
                  <TableCell>
                    <Select
                      {...(item.productId ? { value: item.productId } : {})}
                      onValueChange={(v) => updateItem(item.key, { productId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(products.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} · {p.brand}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className="tabular text-right"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      required
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="tabular text-right"
                      value={item.unitPriceUsd}
                      onChange={(e) => updateItem(item.key, { unitPriceUsd: e.target.value })}
                      required
                    />
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {computedUnitCost(item).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="tabular text-right"
                      value={salePriceValue}
                      onChange={(e) =>
                        updateItem(item.key, { salePrice: e.target.value, salePriceTouched: true })
                      }
                      required
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.key)}
                      disabled={items.length === 1}
                    >
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          Adicionar produto
        </Button>
        <p className="tabular text-sm text-muted-foreground">
          Total da compra: <strong className="text-foreground">R$ {totalCostBrl.toFixed(2)}</strong>
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Confirmando..." : "Confirmar Compra"}
      </Button>
    </form>
  );
}
