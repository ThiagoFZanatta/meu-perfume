import { createFileRoute } from "@tanstack/react-router";

import { UsersPanel } from "@/components/users-panel";

export const Route = createFileRoute("/master/usuarios")({
  component: UsuariosPage,
});

function UsuariosPage() {
  return (
    <div>
      <h2 className="mb-6 font-display text-2xl font-medium">Usuários</h2>
      <UsersPanel />
    </div>
  );
}
