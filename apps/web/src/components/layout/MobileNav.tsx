import { Menu } from "lucide-react";
import { useState } from "react";
import { NavLinks } from "@/components/layout/NavLinks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { navGroupsForUser } from "@/lib/nav-config";
import { useAuth } from "@/stores/auth";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const groups = navGroupsForUser(isAdmin);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="md:hidden">
          <Menu className="h-4 w-4" />
          Menú
        </Button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-full max-h-none w-[min(100%,20rem)] max-w-none translate-x-0 translate-y-0 rounded-none border-r p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200">
        <DialogHeader className="border-b border-border px-4 py-4 text-left">
          <DialogTitle>Finband</DialogTitle>
        </DialogHeader>
        <nav className="overflow-y-auto pb-6">
          <NavLinks groups={groups} variant="mobile" onNavigate={() => setOpen(false)} />
        </nav>
      </DialogContent>
    </Dialog>
  );
}
