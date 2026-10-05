import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CLASS_TYPE_LABELS, type ClassType } from "@finband/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Plus } from "lucide-react";

export function ClassesPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["classes"],
    queryFn: () =>
      api<
        Array<{
          id: string;
          name: string;
          type: ClassType;
          room?: string;
          teacher: { firstName: string; lastName: string };
          _count: { enrollments: number };
          maxStudents: number;
        }>
      >("/classes"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clases</h1>
        {isAdmin ? (
          <Button asChild>
            <Link to="/clases/nueva">
              <Plus className="h-4 w-4" /> Nueva clase
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
                <th className="pb-2">Tipo</th>
                <th className="pb-2">Profesor</th>
                <th className="pb-2">Aula</th>
                <th className="pb-2">Alumnos</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((c) => (
                <tr key={c.id} className="border-b border-border/60">
                  <td className="py-2">
                    <Link className="text-primary hover:underline" to={`/clases/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2">{CLASS_TYPE_LABELS[c.type]}</td>
                  <td className="py-2">
                    {c.teacher.firstName} {c.teacher.lastName}
                  </td>
                  <td className="py-2">{c.room ?? "—"}</td>
                  <td className="py-2">
                    {c._count.enrollments}/{c.maxStudents}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
