import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, ProfileRole } from "@/integrations/supabase/types";

export type ManagedUser = {
  id: string;
  name: string;
  email: string | null;
  role: ProfileRole;
  created_at: string;
};

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  role: z.enum(["master", "vendedor"]),
});

// Tela 11 (RF02) é exclusiva do master. A checagem é repetida aqui — mesmo
// padrão de defesa em profundidade já usado nas RPCs de banco (ex:
// confirm_purchase/confirm_sale) — porque estas duas funções chamam
// `supabaseAdmin` (service role), que não passa pela RLS de `profiles`.
async function assertMaster(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("is_master");
  if (error || !data) {
    throw new Error("Apenas usuários master podem gerenciar usuários.");
  }
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertMaster(context.supabase);

    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, name, role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // auth.users (e-mail) não é exposto via RLS/PostgREST — só a Admin API o
    // alcança, daí o import dinâmico do client de service role (nunca no topo
    // do módulo, já que este arquivo também é enviado ao bundle do cliente).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 200,
    });
    if (authError) throw new Error(authError.message);

    const emailById = new Map(authUsers.users.map((u) => [u.id, u.email ?? null]));

    return (profiles ?? []).map((p) => ({ ...p, email: emailById.get(p.id) ?? null }));
  });

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(createUserSchema)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { name: data.name, role: data.role },
    });

    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        throw new Error("Este e-mail já está cadastrado.");
      }
      throw new Error(error.message);
    }
  });
