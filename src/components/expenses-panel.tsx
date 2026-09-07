import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { ExpenseCategory, Tables } from "@/integrations/supabase/types";
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

type Expense = Tables<"expenses">;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  aluguel: "Aluguel",
  taxa_maquina: "Taxa de máquina",
  outras: "Outras",
};

function useExpenses() {
  return useQuery({
    queryKey: ["despesas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });
}

// RF11 (Fase 2, Tela "Lançamento de Despesas"): sem migração nova — a tabela
// `expenses` e a policy `expenses_all_master` já existiam desde o schema
// inicial (seção "Modelo de dados", incluída para não exigir retrabalho
// estrutural depois). Esta entrega é só o frontend: cadastro + lista, mesmo
// padrão de `orders-panel.tsx` (RF08). O PRD não descreve edição, só
// "lançamento" — a exclusão foi incluída (via ConfirmDeleteButton, mesmo
// padrão já usado em compra/venda/encomenda) como forma mínima de corrigir um
// lançamento errado, já que a policy `expenses_all_master` já cobre `delete`
// sem nenhuma mudança de RLS.
export function ExpensesPanel() {
  return (
    <div className="space-y-8">
      <NewExpenseForm />
      <ExpensesList />
    </div>
  );
}

function NewExpenseForm() {
  const queryClient = useQueryClient();

  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountValue = Number(amount.replace(",", "."));
  const isValid = Boolean(category) && amount.trim().length > 0 && amountValue > 0;

  function resetForm() {
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setCategory("");
    setAmount("");
    setDescription("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !category) {
      setError("Preencha categoria e um valor maior que zero.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from("expenses").insert({
      expense_date: expenseDate,
      category,
      amount: amountValue,
      description: description.trim() || null,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    toast.success("Despesa lançada.");
    resetForm();
    void queryClient.invalidateQueries({ queryKey: ["despesas"] });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-hairline p-4">
      <h3 className="font-display text-lg font-medium">Lançar despesa</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="expense-date">Data *</Label>
          <Input
            id="expense-date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-category">Categoria *</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
            <SelectTrigger id="expense-category">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expense-amount">Valor (R$) *</Label>
          <Input
            id="expense-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expense-description">Descrição</Label>
        <Textarea
          id="expense-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting || !isValid}>
        {submitting ? "Salvando..." : "Salvar Despesa"}
      </Button>
    </form>
  );
}

function ExpensesList() {
  const queryClient = useQueryClient();
  const expenses = useExpenses();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    setDeletingId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Despesa excluída.");
    void queryClient.invalidateQueries({ queryKey: ["despesas"] });
  }

  if (expenses.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (expenses.isError) {
    return <p className="text-danger">Falha ao carregar as despesas.</p>;
  }

  if (expenses.data.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Nenhuma despesa lançada ainda.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.data.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell className="tabular">
                {new Date(`${expense.expense_date}T00:00:00`).toLocaleDateString("pt-BR")}
              </TableCell>
              <TableCell>{EXPENSE_CATEGORY_LABELS[expense.category]}</TableCell>
              <TableCell>{expense.description || "—"}</TableCell>
              <TableCell className="tabular text-right">R$ {expense.amount.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                <ConfirmDeleteButton
                  triggerLabel="Excluir"
                  pendingLabel="Excluindo..."
                  pending={deletingId === expense.id}
                  size="sm"
                  className="text-danger hover:text-danger"
                  title="Excluir esta despesa?"
                  description="O lançamento será apagado definitivamente, inclusive dos relatórios de DRE e fluxo de caixa. Esta ação não pode ser desfeita."
                  onConfirm={() => handleDelete(expense.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
