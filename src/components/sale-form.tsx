import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { PaymentMethod, Tables } from "@/integrations/supabase/types";
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

type Product = Pick<
  Tables<"products_catalog_v">,
  "id" | "name" | "brand" | "current_sale_price" | "stock_quantity"
>;

type ItemRow = {
  key: string;
  productId: string;
  quantity: string;
  discountPercent: string;
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "especie", label: "Espécie" },
  { value: "debito", label: "Débito" },
  { value: "credito_avista", label: "Crédito à vista" },
  { value: "credito_parcelado", label: "Crédito parcelado" },
];

function emptyRow(): ItemRow {
  return { key: crypto.randomUUID(), productId: "", quantity: "", discountPercent: "" };
}

function useActiveProducts() {
  return useQuery({
    queryKey: ["vendas", "produtos-ativos"],
    queryFn: async () => {
      // Tela do vendedor: sempre via products_catalog_v (RF10) — nunca a tabela
      // base, que esconde custo/margem mesmo do próprio front do vendedor.
      const { data, error } = await supabase
        .from("products_catalog_v")
        .select("id, name, brand, current_sale_price, stock_quantity")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

// Registro de venda (Tela 8, RF07/RF06). O preço de venda de cada item vem do
// current_sale_price do produto (não é editável aqui) e a comissão é calculada
// e gravada só pelo backend (`confirm_sale`, RPC) — o vendedor nunca a vê,
// mesma lógica de "a RPC não confia no cliente" já usada em confirm_purchase().
export function SaleForm() {
  const products = useActiveProducts();
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) map.set(p.id, p);
    return map;
  }, [products.data]);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<{ total: number } | null>(null);

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  }

  function subtotal(item: ItemRow) {
    const product = productMap.get(item.productId);
    if (!product) return 0;
    const quantity = Number(item.quantity) || 0;
    const discountPercent = Number(item.discountPercent) || 0;
    return (
      Math.round(product.current_sale_price * quantity * (1 - discountPercent / 100) * 100) / 100
    );
  }

  const totalAmount = items.reduce((sum, item) => sum + subtotal(item), 0);

  // Soma por produto, não por linha: duas linhas do mesmo produto (permitido
  // aqui, ao contrário da Tela 6 — vender o mesmo produto em duas linhas não
  // sobrescreve nenhum dado, só soma) precisam ser conferidas contra o estoque
  // em conjunto, senão cada linha isolada pareceria válida mesmo estourando o
  // estoque disponível somado.
  const quantityByProduct = items.reduce<Record<string, number>>((acc, item) => {
    if (!item.productId) return acc;
    acc[item.productId] = (acc[item.productId] ?? 0) + (Number(item.quantity) || 0);
    return acc;
  }, {});

  const stockError = Object.entries(quantityByProduct).find(([productId, quantity]) => {
    const product = productMap.get(productId);
    return product && quantity > product.stock_quantity;
  });

  const isValid =
    Boolean(paymentMethod) &&
    items.length > 0 &&
    !stockError &&
    items.every((item) => {
      const quantity = Number(item.quantity);
      const discountPercent = Number(item.discountPercent) || 0;
      return (
        Boolean(item.productId) && quantity > 0 && discountPercent >= 0 && discountPercent <= 100
      );
    });

  function resetForm() {
    setItems([emptyRow()]);
    setPaymentMethod("");
    setError(null);
    setCompletedSale(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !paymentMethod) {
      if (stockError) {
        const [productId] = stockError;
        const product = productMap.get(productId);
        setError(
          `Quantidade solicitada de "${product?.name}" maior que o estoque disponível (${product?.stock_quantity} un.).`,
        );
      } else {
        setError("Preencha a forma de pagamento e todos os campos obrigatórios de cada item.");
      }
      return;
    }

    setSubmitting(true);
    setError(null);

    const payloadItems = items.map((item) => ({
      product_id: item.productId,
      quantity: Number(item.quantity),
      discount_percent: Number(item.discountPercent) || 0,
    }));

    const { error: rpcError } = await supabase.rpc("confirm_sale", {
      p_payment_method: paymentMethod,
      p_items: payloadItems,
    });

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setCompletedSale({ total: totalAmount });
    toast.success(`Venda registrada. Total: R$ ${totalAmount.toFixed(2)}`);
    void products.refetch();
  }

  if (completedSale) {
    return (
      <div className="space-y-4 rounded-xl border border-hairline bg-card p-8 text-center">
        <p className="text-lg font-medium text-foreground">Venda registrada com sucesso!</p>
        <p className="tabular text-muted-foreground">
          Total: <strong className="text-foreground">R$ {completedSale.total.toFixed(2)}</strong>
        </p>
        <Button onClick={resetForm}>Nova Venda</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="payment-method">Forma de pagamento *</Label>
        <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
          <SelectTrigger id="payment-method">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-hairline">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Produto</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="text-right">Preço (R$)</TableHead>
              <TableHead className="text-right">Desconto (%)</TableHead>
              <TableHead className="text-right">Subtotal (R$)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const product = productMap.get(item.productId);
              return (
                <TableRow key={item.key}>
                  <TableCell>
                    <Select
                      value={item.productId}
                      onValueChange={(v) => updateItem(item.key, { productId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(products.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id} disabled={p.stock_quantity === 0}>
                            {p.name} · {p.brand} ({p.stock_quantity} un.)
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
                  <TableCell className="tabular text-right text-muted-foreground">
                    {product ? product.current_sale_price.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="tabular text-right"
                      value={item.discountPercent}
                      onChange={(e) => updateItem(item.key, { discountPercent: e.target.value })}
                      placeholder="0"
                    />
                  </TableCell>
                  <TableCell className="tabular text-right">{subtotal(item).toFixed(2)}</TableCell>
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
          Total da venda: <strong className="text-foreground">R$ {totalAmount.toFixed(2)}</strong>
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting || !isValid}>
        {submitting ? "Concluindo..." : "Concluir Venda"}
      </Button>
    </form>
  );
}
