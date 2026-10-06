import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
};

type Props = {
  actions: RowAction[];
  "aria-label"?: string;
};

export function RowActionsMenu({ actions, "aria-label": ariaLabel = "Acciones" }: Props) {
  const normal = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="iconTouch" variant="ghost" aria-label={ariaLabel}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {normal.map((a) => (
          <DropdownMenuItem
            key={a.label}
            disabled={a.disabled}
            onSelect={(e) => {
              e.preventDefault();
              a.onSelect();
            }}
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
        {normal.length > 0 && destructive.length > 0 ? <DropdownMenuSeparator /> : null}
        {destructive.map((a) => (
          <DropdownMenuItem
            key={a.label}
            disabled={a.disabled}
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              e.preventDefault();
              a.onSelect();
            }}
          >
            {a.icon}
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
