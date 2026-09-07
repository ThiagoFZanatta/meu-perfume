import type { ComponentProps } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Botão de exclusão com confirmação — usado em toda ação destrutiva do
// projeto (excluir compra/venda/encomenda) para evitar um clique acidental
// disparando a RPC/delete direto. O handler real (`onConfirm`) e seu próprio
// estado de carregamento continuam por conta de quem chama; este componente
// só interpõe o diálogo antes de chamá-lo.
export function ConfirmDeleteButton({
  triggerLabel,
  pendingLabel,
  pending,
  disabled,
  variant = "ghost",
  size,
  className,
  triggerTitle,
  title,
  description,
  onConfirm,
}: {
  triggerLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  triggerTitle?: string | undefined;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          disabled={disabled || pending}
          title={triggerTitle}
        >
          {pending ? pendingLabel : triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(buttonVariants({ variant: "destructive" }))}
          >
            {triggerLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
