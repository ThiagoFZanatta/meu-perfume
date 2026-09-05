import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";
import type { ProfileRole } from "@/integrations/supabase/types";

const HOME_BY_ROLE: Record<ProfileRole, string> = {
  master: "/master",
  vendedor: "/vendedor",
};

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-wine border-t-transparent" />
    </div>
  );
}

// Guarda de rota por papel (RF02): redireciona para o login quando não há
// sessão, e para a home do papel correto quando o usuário tenta acessar
// diretamente a área do outro papel pela URL.
export function RequireRole({ role, children }: { role: ProfileRole; children: ReactNode }) {
  const { session, profile, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (profile && profile.role !== role) {
      navigate({ to: HOME_BY_ROLE[profile.role] });
    }
  }, [isLoading, session, profile, role, navigate]);

  if (isLoading || !session || !profile || profile.role !== role) {
    return <FullScreenSpinner />;
  }

  return <>{children}</>;
}
