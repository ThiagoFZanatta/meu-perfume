import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";

type Sale = Tables<"sales_seller_v">;

const PAYMENT_LABELS: Record<Sale["payment_method"], string> = {
  especie: "Espécie",
  debito: "Débito",
  credito_avista: "Crédito à vista",
  credito_parcelado: "Crédito parcelado",
};

function useEditWindowHours() {
  return useQuery({
    queryKey: ["settings", "edit_window_hours_seller"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "edit_window_hours_seller")
        .maybeSingle();
      if (error) throw error;
      return Number(data?.value ?? 2);
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useRecentSales() {
  return useQuery({
    queryKey: ["vendedor", "vendas-recentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_seller_v")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as Sale[];
    },
  });
}

// RF13 (Tela 8, "Correção"): lista compacta das últimas vendas do próprio
// vendedor, com exclusão habilitada só dentro da janela de correção (padrão
// configurado em settings.edit_window_hours_seller, default 2h). Não é a
// listagem completa de histórico de vendas (pendência documentada, deferida
// para Relatórios/RF09) — só o suficiente para a correção prevista em RF13.
export function SellerRecentSales() {
  const sales = useRecentSales();
  const editWindow = useEditWindowHours();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (sales.isPending) return null;
  if (sales.isError || !sales.data || sales.data.length === 0) return null;

  const windowHours = editWindow.data ?? 2;

  async function handleDelete(saleId: string) {
    setDeletingId(saleId);
    const { error } = await supabase.rpc("delete_sale", { p_sale_id: saleId });
    setDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Venda excluída e estoque reposto.");
    void queryClient.invalidateQueries({ queryKey: ["vendedor", "vendas-recentes"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "vendedor", "catalog"] });
  }

  return (
    <div className="mt-8">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Minhas últimas vendas</h3>
      <div className="divide-y divide-hairline rounded-xl border border-hairline">
        {sales.data.map((sale) => {
          const withinWindow =
            sale.status === "concluida" &&
            Date.now() - new Date(sale.created_at).getTime() < windowHours * 60 * 60 * 1000;
          return (
            <div key={sale.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="tabular text-sm font-medium">R$ {sale.total_amount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  {PAYMENT_LABELS[sale.payment_method]} ·{" "}
                  {new Date(sale.created_at).toLocaleString("pt-BR")}
                  {sale.status !== "concluida" && " · devolvida"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!withinWindow || deletingId === sale.id}
                onClick={() => handleDelete(sale.id)}
                title={
                  !withinWindow
                    ? "Fora da janela de correção (ou venda já devolvida) — só o master pode corrigir agora"
                    : undefined
                }
              >
                {deletingId === sale.id ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
