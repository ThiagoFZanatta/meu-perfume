import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type View = "login" | "forgot" | "bootstrap";

const HOME_BY_ROLE = {
  master: "/master",
  vendedor: "/vendedor",
} as const;

function LoginPage() {
  const navigate = useNavigate();
  const { session, profile, isLoading } = useAuth();

  const [view, setView] = useState<View>("login");
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.rpc("needs_bootstrap").then(({ data }) => {
      if (data) setNeedsBootstrap(true);
    });
  }, []);

  // Já autenticado (ex: voltou para /login com sessão ativa): manda para a home do papel.
  useEffect(() => {
    if (!isLoading && session && profile) {
      navigate({ to: HOME_BY_ROLE[profile.role] });
    }
  }, [isLoading, session, profile, navigate]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.session) {
      setError("E-mail ou senha incorretos.");
      setSubmitting(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.session.user.id)
      .single();

    setSubmitting(false);
    navigate({ to: HOME_BY_ROLE[profileRow?.role ?? "vendedor"] });
  }

  async function handleBootstrap(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      navigate({ to: "/master" });
    } else {
      toast.success("Conta criada. Verifique seu e-mail para confirmar e depois faça login.");
      setView("login");
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);

    setSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    toast.success("Se o e-mail existir, enviamos um link de redefinição de senha.");
    setView("login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-medium text-wine">Meu Perfume</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controle de compra e venda</p>
        </div>

        <Card>
          <CardHeader>
            <h2 className="font-display text-lg font-medium">
              {view === "login" && "Entrar"}
              {view === "forgot" && "Redefinir senha"}
              {view === "bootstrap" && "Criar conta de administrador"}
            </h2>
          </CardHeader>
          <CardContent>
            {view === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !email || !password}
                >
                  {submitting ? "Entrando..." : "Entrar"}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setError(null);
                      setView("forgot");
                    }}
                  >
                    Esqueci minha senha
                  </button>
                  {needsBootstrap && (
                    <button
                      type="button"
                      className="text-wine underline-offset-4 hover:underline"
                      onClick={() => {
                        setError(null);
                        setView("bootstrap");
                      }}
                    >
                      Criar conta master
                    </button>
                  )}
                </div>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">E-mail</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting || !email}>
                  {submitting ? "Enviando..." : "Enviar link de redefinição"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setError(null);
                    setView("login");
                  }}
                >
                  Voltar para o login
                </button>
              </form>
            )}

            {view === "bootstrap" && (
              <form onSubmit={handleBootstrap} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bootstrap-name">Nome</Label>
                  <Input
                    id="bootstrap-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bootstrap-email">E-mail</Label>
                  <Input
                    id="bootstrap-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bootstrap-password">Senha</Label>
                  <Input
                    id="bootstrap-password"
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-danger">{error}</p>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !name || !email || !password}
                >
                  {submitting ? "Criando..." : "Criar conta"}
                </Button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setError(null);
                    setView("login");
                  }}
                >
                  Voltar para o login
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
