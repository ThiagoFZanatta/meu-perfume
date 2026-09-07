import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { listManagedUsers, createManagedUser } from "@/lib/manage-users.functions";
import type { ProfileRole } from "@/integrations/supabase/types";
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

const ROLE_LABELS: Record<ProfileRole, string> = {
  master: "Master",
  vendedor: "Vendedor",
};

function useManagedUsers() {
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listManagedUsers(),
  });
}

// Tela 11 (RF02): cadastro + lista de usuários, exclusiva do master (garantido
// pelo RequireRole do layout /master, e checado de novo no servidor — ver
// src/lib/manage-users.functions.ts). A criação de conta em si (senha inicial)
// é feita pelo próprio usuário via link de convite enviado por e-mail, não por
// aqui — o master só define nome, e-mail e papel.
export function UsersPanel() {
  return (
    <div className="space-y-8">
      <NewUserForm />
      <UsersList />
    </div>
  );
}

function NewUserForm() {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProfileRole | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = Boolean(name.trim() && email.trim() && role);

  function resetForm() {
    setName("");
    setEmail("");
    setRole("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || !role) {
      setError("Preencha nome, e-mail e papel.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createManagedUser({ data: { name: name.trim(), email: email.trim(), role } });
      toast.success("Usuário criado. Um e-mail de convite foi enviado para definir a senha.");
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-hairline p-4"
    >
      <h3 className="font-display text-lg font-medium">Novo usuário</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="user-name">Nome *</Label>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-email">E-mail *</Label>
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-role">Papel *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ProfileRole)}>
            <SelectTrigger id="user-role">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vendedor">Vendedor</SelectItem>
              <SelectItem value="master">Master</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting || !isValid}>
        {submitting ? "Criando..." : "Novo Usuário"}
      </Button>
    </form>
  );
}

function UsersList() {
  const users = useManagedUsers();

  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-medium">Usuários</h3>

      {users.isPending ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : users.isError ? (
        <p className="text-danger">Falha ao carregar os usuários.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data!.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email ?? "—"}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell className="tabular">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
