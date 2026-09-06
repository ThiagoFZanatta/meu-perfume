import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { signOut, type Profile } from "@/lib/auth";

export function DashboardShell({
  profile,
  navItems,
  children,
}: {
  profile: Profile;
  navItems: string[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div>
          <h1 className="font-display text-lg font-medium text-wine">Meu Perfume</h1>
          <p className="text-xs text-muted-foreground">Olá, {profile.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sair
        </Button>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {navItems.length > 0 && (
          <nav className="flex gap-2 overflow-x-auto border-b border-hairline pb-2 lg:w-48 lg:flex-none lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            {navItems.map((item) => (
              <span
                key={item}
                title="Em breve"
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </nav>
        )}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
