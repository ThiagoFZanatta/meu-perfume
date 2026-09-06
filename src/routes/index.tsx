import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

const HOME_BY_ROLE = {
  master: "/master",
  vendedor: "/vendedor",
} as const;

// Porta de entrada: não é uma tela em si — apenas encaminha para o login ou
// para a home do papel do usuário autenticado (RF01).
function Index() {
  const { session, profile, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (profile) {
      navigate({ to: HOME_BY_ROLE[profile.role] });
    }
  }, [isLoading, session, profile, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-wine border-t-transparent" />
    </div>
  );
}
