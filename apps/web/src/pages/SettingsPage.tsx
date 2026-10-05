import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useState } from "react";

export function SettingsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "READONLY" });

  const school = useQuery({
    queryKey: ["school"],
    queryFn: () => api<Record<string, string>>("/settings/school"),
  });

  const years = useQuery({
    queryKey: ["years"],
    queryFn: () => api<Array<{ id: string; name: string }>>("/settings/academic-years"),
  });

  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<Array<{ id: string; username: string; role: string }>>("/admin/users"),
    enabled: isAdmin,
  });

  const saveSchool = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api("/settings/school", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["school"] }),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api("/admin/users", { method: "POST", body: JSON.stringify(newUser) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  async function onSchoolSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      body[k] = v;
    });
    await saveSchool.mutateAsync(body);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configuración del centro</h1>

      <form onSubmit={onSchoolSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Datos de la escuela</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input name="name" defaultValue={school.data?.name ?? ""} disabled={!isAdmin} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input name="email" defaultValue={school.data?.email ?? ""} disabled={!isAdmin} />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input name="phone" defaultValue={school.data?.phone ?? ""} disabled={!isAdmin} />
            </div>
            <div className="space-y-1">
              <Label>Dirección</Label>
              <Input name="address" defaultValue={school.data?.address ?? ""} disabled={!isAdmin} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Curso académico activo</Label>
              <select
                name="activeYearId"
                defaultValue={school.data?.activeYearId ?? ""}
                disabled={!isAdmin}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
              >
                <option value="">—</option>
                {years.data?.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
        {isAdmin ? (
          <Button type="submit" className="mt-4">
            Guardar centro
          </Button>
        ) : null}
      </form>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm">
              {users.data?.map((u) => (
                <li key={u.id}>
                  {u.username} — {u.role === "ADMIN" ? "Administrador" : "Consulta"}
                </li>
              ))}
            </ul>
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                placeholder="Usuario"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <Input
                placeholder="Contraseña"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <select
                className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="ADMIN">Administrador</option>
                <option value="READONLY">Consulta</option>
              </select>
              <Button onClick={() => createUser.mutate()}>Crear usuario</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
