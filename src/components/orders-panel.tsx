import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
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

type Order = Tables<"orders">;
type Product = Pick<Tables<"products_catalog_v">, "id" | "name" | "brand">;

const OUTRO_PRODUTO = "__outro__";

function useCatalogProducts() {
  return useQuery({
    queryKey: ["encomendas", "produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products_catalog_v")
        .select("id, name, brand")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });
}

function useOrders(status: Order["status"]) {
  return useQuery({
    queryKey: ["encomendas", "lista", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: status === "aberto" });
      if (error) throw error;
      return data as Order[];
    },
  });
}

// Tela 9 (RF08): cadastro + lista de encomendas, compartilhada entre master e
// vendedor — tanto a tabela `orders` quanto suas policies já foram criadas no
// schema inicial (nenhuma migração nova é necessária para este RF).
export function OrdersPanel() {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-8">
      <NewOrderForm />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-medium">
            {showHistory ? "Encomendas atendidas" : "Encomendas em aberto"}
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Ver em aberto" : "Ver histórico de atendidas"}
          </Button>
        </div>
        <OrdersList status={showHistory ? "atendido" : "aberto"} />
      </div>
    </div>
  );
}

function NewOrderForm() {
  const queryClient = useQueryClient();
  const products = useCatalogProducts();

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [productChoice, setProductChoice] = useState("");
  const [productText, setProductText] = useState("");
  const [observation, setObservation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFreeText = productChoice === OUTRO_PRODUTO;

  const isValid =
    customerName.trim().length > 0 &&
    customerContact.trim().length > 0 &&
    Boolean(productChoice) &&
    (!isFreeText || productText.trim().length > 0);

  function resetForm() {
    setCustomerName("");
    setCustomerContact("");
    setProductChoice("");
    setProductText("");
    setObservation("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) {
      setError("Preencha nome, contato e o produto desejado.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from("orders").insert({
      customer_name: customerName.trim(),
      customer_contact: customerContact.trim(),
      desired_product_id: isFreeText ? null : productChoice,
      desired_product_text: isFreeText ? productText.trim() : null,
      observation: observation.trim() || null,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    toast.success("Encomenda salva.");
    resetForm();
    void queryClient.invalidateQueries({ queryKey: ["encomendas"] });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-hairline p-4">
      <h3 className="font-display text-lg font-medium">Cadastrar encomenda</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="order-customer-name">Nome do cliente *</Label>
          <Input
            id="order-customer-name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-customer-contact">Contato/telefone *</Label>
          <Input
            id="order-customer-contact"
            value={customerContact}
            onChange={(e) => setCustomerContact(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-product">Produto desejado *</Label>
          <Select value={productChoice} onValueChange={setProductChoice}>
            <SelectTrigger id="order-product">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(products.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.brand}
                </SelectItem>
              ))}
              <SelectItem value={OUTRO_PRODUTO}>Outro (não está no catálogo)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isFreeText && (
          <div className="space-y-1.5">
            <Label htmlFor="order-product-text">Descreva o produto *</Label>
            <Input
              id="order-product-text"
              value={productText}
              onChange={(e) => setProductText(e.target.value)}
              required
            />
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="order-observation">Observação</Label>
        <Textarea
          id="order-observation"
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting || !isValid}>
        {submitting ? "Salvando..." : "Salvar Encomenda"}
      </Button>
    </form>
  );
}

function OrdersList({ status }: { status: Order["status"] }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isMaster = profile?.role === "master";
  const orders = useOrders(status);
  const products = useCatalogProducts();
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products.data ?? []) map.set(p.id, p);
    return map;
  }, [products.data]);

  function productLabel(order: Order) {
    if (order.desired_product_id) {
      const product = productMap.get(order.desired_product_id);
      return product ? `${product.name} · ${product.brand}` : order.desired_product_text || "—";
    }
    return order.desired_product_text || "—";
  }

  async function handleMarkAttended(id: string) {
    setMarkingId(id);
    const { error } = await supabase.from("orders").update({ status: "atendido" }).eq("id", id);
    setMarkingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Encomenda marcada como atendida.");
    void queryClient.invalidateQueries({ queryKey: ["encomendas"] });
  }

  // RF08/LGPD (seção 8 do PRD): exclusão de encomenda a pedido do cliente —
  // a policy `orders_delete_master` já restringia isso ao master desde o
  // schema inicial; só faltava o botão. Vendedor não vê a ação (nem tenta
  // e ser barrado pela RLS).
  async function handleDelete(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("orders").delete().eq("id", id);
    setDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Encomenda excluída.");
    void queryClient.invalidateQueries({ queryKey: ["encomendas"] });
  }

  if (orders.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (orders.isError) {
    return <p className="text-danger">Falha ao carregar as encomendas.</p>;
  }

  if ((orders.data ?? []).length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {status === "aberto" ? "Nenhuma encomenda em aberto." : "Nenhuma encomenda atendida ainda."}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Data do pedido</TableHead>
            {(status === "aberto" || isMaster) && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {(orders.data ?? []).map((order) => (
            <TableRow key={order.id}>
              <TableCell>{order.customer_name}</TableCell>
              <TableCell>{order.customer_contact}</TableCell>
              <TableCell>{productLabel(order)}</TableCell>
              <TableCell className="tabular">
                {new Date(order.created_at).toLocaleDateString("pt-BR")}
              </TableCell>
              {(status === "aberto" || isMaster) && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {status === "aberto" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={markingId === order.id}
                        onClick={() => handleMarkAttended(order.id)}
                      >
                        {markingId === order.id ? "Marcando..." : "Marcar como atendido"}
                      </Button>
                    )}
                    {isMaster && (
                      <ConfirmDeleteButton
                        triggerLabel="Excluir"
                        pendingLabel="Excluindo..."
                        pending={deletingId === order.id}
                        size="sm"
                        className="text-danger hover:text-danger"
                        title="Excluir esta encomenda?"
                        description="O registro do pedido será apagado definitivamente, inclusive do histórico. Esta ação não pode ser desfeita."
                        onConfirm={() => handleDelete(order.id)}
                      />
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
