import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";

type Sale = Tables<"sales_seller_v">;

const PAGE_SIZE = 10;

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
  return useInfiniteQuery({
    queryKey: ["vendedor", "vendas-recentes"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from("sales_seller_v")
        .select("*")
        .order("created_at", { ascending: false })
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return data as Sale[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
  });
}

// RF13 (Tela 8, "Correção"): lista das próprias vendas, com exclusão
// habilitada só dentro da janela de correção (padrão configurado em
// settings.edit_window_hours_seller, default 2h) — e paginada ("Carregar
// mais") em vez de um corte fixo em 10, cobrindo também a pendência de
// listagem completa de histórico registrada para o vendedor.
export function SellerRecentSales() {
  const sales = useRecentSales();
  const editWindow = useEditWindowHours();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const allSales = useMemo(() => sales.data?.pages.flat() ?? [], [sales.data]);

  if (sales.isPending) return null;
  if (sales.isError || allSales.length === 0) return null;

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
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">Minhas vendas</h3>
      <div className="divide-y divide-hairline rounded-xl border border-hairline">
        {allSales.map((sale) => {
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
              <ConfirmDeleteButton
                triggerLabel="Excluir"
                pendingLabel="Excluindo..."
                pending={deletingId === sale.id}
                disabled={!withinWindow}
                size="sm"
                triggerTitle={
                  !withinWindow
                    ? "Fora da janela de correção (ou venda já devolvida) — só o master pode corrigir agora"
                    : undefined
                }
                title="Excluir esta venda?"
                description="O estoque vendido nela será reposto e a venda deixará de existir. Esta ação não pode ser desfeita."
                onConfirm={() => handleDelete(sale.id)}
              />
            </div>
          );
        })}
      </div>
      {sales.hasNextPage && (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sales.isFetchingNextPage}
            onClick={() => sales.fetchNextPage()}
          >
            {sales.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
