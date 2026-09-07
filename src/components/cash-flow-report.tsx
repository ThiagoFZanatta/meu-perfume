import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { EXPENSE_CATEGORY_LABELS } from "@/components/expenses-panel";
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

type Sale = Pick<Tables<"sales">, "id" | "sale_date" | "total_amount">;
type Purchase = Pick<Tables<"purchases">, "id" | "purchase_date" | "total_cost_brl">;
type Expense = Pick<Tables<"expenses">, "id" | "expense_date" | "amount" | "category">;

type Entry = { date: string; description: string; inflow: number; outflow: number };

function useSalesInPeriod(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["fluxo-caixa", "vendas", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("sales").select("id, sale_date, total_amount");
      if (dateFrom) query = query.gte("sale_date", dateFrom);
      if (dateTo) query = query.lte("sale_date", `${dateTo}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      return data as Sale[];
    },
  });
}

function usePurchasesInPeriod(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["fluxo-caixa", "compras", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("purchases").select("id, purchase_date, total_cost_brl");
      if (dateFrom) query = query.gte("purchase_date", dateFrom);
      if (dateTo) query = query.lte("purchase_date", dateTo);
      const { data, error } = await query;
      if (error) throw error;
      return data as Purchase[];
    },
  });
}

function useExpensesInPeriod(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["fluxo-caixa", "despesas", dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase.from("expenses").select("id, expense_date, amount, category");
      if (dateFrom) query = query.gte("expense_date", dateFrom);
      if (dateTo) query = query.lte("expense_date", dateTo);
      const { data, error } = await query;
      if (error) throw error;
      return data as Expense[];
    },
  });
}

// Tela "Fluxo de Caixa" (RF12, Fase 2, master-only): extrato cronológico de
// entradas (vendas) e saídas (compras, despesas), com saldo acumulado —
// mesmo racional de "sem migração/RPC nova, agregação no cliente" já usado em
// `dre-report.tsx`/`stock-turnover-report.tsx`. Vendas no cartão entram pela
// `sale_date`, tratadas como "à vista" (premissa do PRD, seção 11: "o saldo
// cai no dia seguinte", não há rastreio de parcelas). O saldo acumulado
// começa em 0 no início do período filtrado — o sistema não guarda um saldo
// de caixa anterior ao próprio histórico de lançamentos.
export function CashFlowReport() {
  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(today), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(today), "yyyy-MM-dd"));

  const sales = useSalesInPeriod(dateFrom, dateTo);
  const purchases = usePurchasesInPeriod(dateFrom, dateTo);
  const expenses = useExpensesInPeriod(dateFrom, dateTo);

  const isLoading = sales.isPending || purchases.isPending || expenses.isPending;
  const isError = sales.isError || purchases.isError || expenses.isError;

  const entries = useMemo<Entry[]>(() => {
    if (!sales.data || !purchases.data || !expenses.data) return [];

    const rows: Entry[] = [
      ...sales.data.map((s) => ({
        date: s.sale_date,
        description: "Venda",
        inflow: s.total_amount,
        outflow: 0,
      })),
      ...purchases.data.map((p) => ({
        date: p.purchase_date,
        description: "Compra",
        inflow: 0,
        outflow: p.total_cost_brl,
      })),
      ...expenses.data.map((e) => ({
        date: e.expense_date,
        description: `Despesa: ${EXPENSE_CATEGORY_LABELS[e.category]}`,
        inflow: 0,
        outflow: e.amount,
      })),
    ];

    return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sales.data, purchases.data, expenses.data]);

  const totalInflow = entries.reduce((sum, e) => sum + e.inflow, 0);
  const totalOutflow = entries.reduce((sum, e) => sum + e.outflow, 0);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-danger">Falha ao processar o fluxo de caixa.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
        <div className="space-y-1.5">
          <Label htmlFor="cashflow-date-from">Período de</Label>
          <Input
            id="cashflow-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cashflow-date-to">até</Label>
          <Input
            id="cashflow-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Nenhum lançamento no período selecionado.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Saída</TableHead>
                  <TableHead className="text-right">Saldo acumulado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  let balance = 0;
                  return entries.map((entry, i) => {
                    balance += entry.inflow - entry.outflow;
                    return (
                      <TableRow key={i}>
                        <TableCell className="tabular">
                          {new Date(entry.date).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="tabular text-right">
                          {entry.inflow > 0 ? `R$ ${entry.inflow.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="tabular text-right">
                          {entry.outflow > 0 ? `R$ ${entry.outflow.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell
                          className={`tabular text-right font-medium ${balance < 0 ? "text-danger" : ""}`}
                        >
                          R$ {balance.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SummaryCard label="Total de entradas" value={totalInflow} />
            <SummaryCard label="Total de saídas" value={totalOutflow} />
            <SummaryCard label="Saldo do período" value={totalInflow - totalOutflow} emphasis />
          </dl>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`tabular mt-1 ${emphasis ? "font-display text-xl font-medium" : "text-lg"} ${
          value < 0 ? "text-danger" : ""
        }`}
      >
        R$ {value.toFixed(2)}
      </dd>
    </div>
  );
}
