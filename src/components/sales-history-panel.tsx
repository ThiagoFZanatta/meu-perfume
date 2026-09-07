import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
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

type Sale = Tables<"sales">;
type Profile = Pick<Tables<"profiles">, "id" | "name" | "role">;

const PAGE_SIZE = 20;

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

type Filters = { sellerId: string; dateFrom: string; dateTo: string; status: string };

function useSellers() {
  return useQuery({
    queryKey: ["vendas-historico", "vendedores"],
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

function useSalesHistory(filters: Filters) {
  return useInfiniteQuery({
    queryKey: ["vendas-historico", "vendas", filters],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("sales")
        .select("*")
        .order("sale_date", { ascending: false })
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);
      if (filters.sellerId) query = query.eq("seller_id", filters.sellerId);
      if (filters.dateFrom) query = query.gte("sale_date", filters.dateFrom);
      if (filters.dateTo) query = query.lte("sale_date", `${filters.dateTo}T23:59:59`);
      if (filters.status) query = query.eq("status", filters.status as Sale["status"]);
      const { data, error } = await query;
      if (error) throw error;
      return data as Sale[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length : undefined,
  });
}

// Tela de histórico completo de vendas (master) — pendência registrada nas
// seções 13/15 do PROGRESSO.md: nem a busca de "Devolução de Venda"
// (sale-return-panel.tsx, focada em correção/devolução, limitada a 50
// resultados) nem "Minhas últimas vendas" do vendedor eram uma listagem
// paginada com todos os registros. Esta tela é só leitura — para corrigir ou
// devolver uma venda, o master continua usando a Tela 12.
export function SalesHistoryPanel() {
  const [sellerId, setSellerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");

  const sellers = useSellers();
  const sales = useSalesHistory({ sellerId, dateFrom, dateTo, status });

  const sellerMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const s of sellers.data ?? []) map.set(s.id, s);
    return map;
  }, [sellers.data]);

  const allSales = useMemo(() => sales.data?.pages.flat() ?? [], [sales.data]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="history-seller">Vendedor</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger id="history-seller">
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
          <Label htmlFor="history-date-from">De</Label>
          <Input
            id="history-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="history-date-to">Até</Label>
          <Input
            id="history-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="history-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="history-status">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUS_LABELS) as [Sale["status"], string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {sales.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : sales.isError ? (
        <p className="text-danger">Falha ao carregar as vendas.</p>
      ) : allSales.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhuma venda encontrada.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="tabular">
                      {new Date(sale.sale_date).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>{sellerMap.get(sale.seller_id)?.name ?? "—"}</TableCell>
                    <TableCell>{PAYMENT_LABELS[sale.payment_method]}</TableCell>
                    <TableCell className="tabular text-right">
                      R$ {sale.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sale.status === "concluida" ? "outline" : "secondary"}>
                        {STATUS_LABELS[sale.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {sales.hasNextPage && (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={sales.isFetchingNextPage}
                onClick={() => sales.fetchNextPage()}
              >
                {sales.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
