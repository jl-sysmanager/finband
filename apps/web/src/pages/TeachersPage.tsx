import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { Plus } from "lucide-react";

export function TeachersPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["teachers"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          firstName: string;
          lastName: string;
          specialty?: string;
          hourlyRate: number;
          classGroups: unknown[];
        }>
      >("/teachers"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profesores</h1>
        {isAdmin ? (
          <Button asChild>
            <Link to="/profesores/nuevo">
              <Plus className="h-4 w-4" /> Nuevo
            </Link>
          </Button>
        ) : null}
      </div>
      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2">Nombre</th>
                <th className="pb-2">Especialidad</th>
                <th className="pb-2">€/hora</th>
                <th className="pb-2">Clases</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((t) => (
                <tr key={t.id} className="border-b border-border/60">
                  <td className="py-2">
                    <Link className="text-primary hover:underline" to={`/profesores/${t.id}`}>
                      {t.lastName}, {t.firstName}
                    </Link>
                  </td>
                  <td className="py-2">{t.specialty ?? "—"}</td>
                  <td className="py-2">{formatMoney(t.hourlyRate)}</td>
                  <td className="py-2">{t.classGroups?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
