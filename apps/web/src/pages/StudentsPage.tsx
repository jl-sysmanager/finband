import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

type StudentRow = {
  id: string;
  firstName: string;
  lastName: string;
  mainInstrument?: string | null;
  level?: string | null;
  status: string;
  primaryTeacher?: { firstName: string; lastName: string } | null;
};

export function StudentsPage() {
  const [search, setSearch] = useState("");
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const q = useQuery({
    queryKey: ["students", search],
    queryFn: () =>
      api<{ items: StudentRow[]; total: number }>(
        `/students?search=${encodeURIComponent(search)}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Alumnos</h1>
          <p className="text-sm text-muted-foreground">{q.data?.total ?? 0} registrados</p>
        </div>
        {isAdmin ? (
          <Button asChild>
            <Link to="/alumnos/nuevo">
              <Plus className="h-4 w-4" /> Nuevo alumno
            </Link>
          </Button>
        ) : null}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 font-medium">Nombre</th>
                <th className="pb-2 font-medium">Instrumento</th>
                <th className="pb-2 font-medium">Nivel</th>
                <th className="pb-2 font-medium">Profesor</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.items.map((s) => (
                <tr key={s.id} className="border-b border-border/60 hover:bg-muted/40">
                  <td className="py-2">
                    <Link className="font-medium text-primary hover:underline" to={`/alumnos/${s.id}`}>
                      {s.lastName}, {s.firstName}
                    </Link>
                  </td>
                  <td className="py-2">{s.mainInstrument ?? "—"}</td>
                  <td className="py-2">{s.level ?? "—"}</td>
                  <td className="py-2">
                    {s.primaryTeacher
                      ? `${s.primaryTeacher.firstName} ${s.primaryTeacher.lastName}`
                      : "—"}
                  </td>
                  <td className="py-2">
                    <Badge>{s.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
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
