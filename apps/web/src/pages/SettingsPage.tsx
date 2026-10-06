import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DataTable,
  DataTableHead,
  DataTableRow,
  DataTableTd,
  DataTableTh,
} from "@/components/list/DataTable";
import { PageHeader } from "@/components/list/PageHeader";
import { ApiError, api, downloadUrl, uploadBackup } from "@/lib/api";
import { FormSelect } from "@/components/form/FormSelect";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RowActionsMenu } from "@/components/list/RowActionsMenu";
import { useAuth } from "@/stores/auth";
import { useConfirm } from "@/hooks/useConfirm";
import { Download, Trash2, Upload } from "lucide-react";
import { useState } from "react";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Administrador" },
  { value: "READONLY", label: "Consulta" },
];

export function SettingsPage() {
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const qc = useQueryClient();
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "READONLY" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState({
    username: "",
    password: "",
    role: "READONLY",
  });
  const currentUser = useAuth((s) => s.user);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupOk, setBackupOk] = useState<string | null>(null);
  const [restorePending, setRestorePending] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setNewUser({ username: "", password: "", role: "READONLY" });
      setUserError(null);
    },
    onError: (err) => {
      setUserError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    },
  });

  const updateUser = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (editUser.username) body.username = editUser.username;
      if (editUser.password) body.password = editUser.password;
      if (editUser.role) body.role = editUser.role;
      return api(`/admin/users/${editingUserId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditingUserId(null);
      setEditUser({ username: "", password: "", role: "READONLY" });
      setUserError(null);
    },
    onError: (err) => {
      setUserError(err instanceof ApiError ? err.message : "No se pudo actualizar el usuario");
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setUserError(null);
      setEditingUserId((prev) => (prev === deletedId ? null : prev));
    },
    onError: (err) => {
      setUserError(err instanceof ApiError ? err.message : "No se pudo eliminar el usuario");
    },
  });

  function startEdit(u: { id: string; username: string; role: string }) {
    setEditingUserId(u.id);
    setEditUser({ username: u.username, password: "", role: u.role });
    setUserError(null);
  }

  async function onSchoolSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveError(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      body[k] = v;
    });
    try {
      await saveSchool.mutateAsync(body);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración");
    }
  }

  if (school.isLoading || years.isLoading) {
    return <p className="text-muted-foreground">Cargando configuración…</p>;
  }

  if (school.isError) {
    return <p className="text-destructive">No se pudo cargar la configuración.</p>;
  }

  async function removeUser(userId: string, username: string) {
    const ok = await confirm({
      title: "Eliminar usuario",
      description: `¿Eliminar al usuario ${username}?`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteUser.mutate(userId);
  }

  return (
    <div className="page-container space-y-6">
      {confirmDialog}
      <PageHeader title="Configuración del centro" description="Datos del centro y usuarios de acceso" />

      <form key={`school-${school.dataUpdatedAt}`} onSubmit={onSchoolSubmit}>
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
        {saveError ? <p className="mt-4 text-sm text-destructive">{saveError}</p> : null}
        {isAdmin ? (
          <Button type="submit" className="mt-4" disabled={saveSchool.isPending}>
            Guardar centro
          </Button>
        ) : null}
      </form>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Copia de seguridad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Descargue una copia completa de la base de datos (alumnos, pagos, configuración).
              Guarde el archivo en un lugar seguro. La restauración sustituye todos los datos
              actuales por los del archivo seleccionado.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={downloadUrl("/admin/backup/database")} download>
                  <Download className="h-4 w-4" /> Descargar copia de seguridad
                </a>
              </Button>
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <Label>Restaurar desde archivo .sqlite</Label>
              <Input
                type="file"
                accept=".sqlite,.db,application/octet-stream"
                onChange={(e) => {
                  setBackupFile(e.target.files?.[0] ?? null);
                  setBackupError(null);
                  setBackupOk(null);
                }}
              />
              <Button
                variant="destructive"
                disabled={!backupFile || restorePending}
                onClick={async () => {
                  if (!backupFile) return;
                  const ok = await confirm({
                    title: "Restaurar copia de seguridad",
                    description:
                      "¿Restaurar esta copia? Se perderán los datos actuales no incluidos en el archivo. Se guardará una copia de seguridad automática antes de continuar.",
                    confirmLabel: "Restaurar",
                    destructive: true,
                  });
                  if (!ok) return;
                  setRestorePending(true);
                  setBackupError(null);
                  setBackupOk(null);
                  try {
                    const res = await uploadBackup(backupFile);
                    setBackupOk(res.message ?? "Copia restaurada correctamente.");
                    setBackupFile(null);
                    qc.clear();
                    window.setTimeout(() => window.location.reload(), 1500);
                  } catch (err) {
                    setBackupError(
                      err instanceof ApiError ? err.message : "No se pudo restaurar la copia",
                    );
                  } finally {
                    setRestorePending(false);
                  }
                }}
              >
                <Upload className="h-4 w-4" />{" "}
                {restorePending ? "Restaurando…" : "Restaurar copia de seguridad"}
              </Button>
            </div>
            {backupError ? <p className="text-destructive">{backupError}</p> : null}
            {backupOk ? <p className="text-income">{backupOk}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable>
              <DataTableHead>
                <DataTableTh>Usuario</DataTableTh>
                <DataTableTh>Rol</DataTableTh>
                <DataTableTh className="w-28" />
              </DataTableHead>
              <tbody>
                {users.data?.map((u) => (
                  <DataTableRow key={u.id} onClick={() => isAdmin && startEdit(u)}>
                    <DataTableTd className="font-medium">{u.username}</DataTableTd>
                    <DataTableTd>{u.role === "ADMIN" ? "Administrador" : "Consulta"}</DataTableTd>
                    <DataTableTd className="text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActionsMenu
                        actions={[
                          { label: "Editar", onSelect: () => startEdit(u) },
                          {
                            label: "Eliminar",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            disabled: u.id === currentUser?.id,
                            onSelect: () => void removeUser(u.id, u.username),
                          },
                        ]}
                      />
                    </DataTableTd>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>

            <Dialog open={!!editingUserId} onOpenChange={(o) => !o && setEditingUserId(null)}>
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Editar usuario</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <Input
                    placeholder="Usuario"
                    value={editUser.username}
                    onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  />
                  <Input
                    placeholder="Nueva contraseña (opcional)"
                    type="password"
                    value={editUser.password}
                    onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                  />
                  <FormSelect
                    value={editUser.role}
                    onValueChange={(role) => setEditUser({ ...editUser, role })}
                    options={ROLE_OPTIONS}
                    disabled={editingUserId === currentUser?.id}
                  />
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingUserId(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" disabled={updateUser.isPending} onClick={() => updateUser.mutate()}>
                    Guardar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-sm font-medium">Nuevo usuario</p>
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
                <FormSelect
                  value={newUser.role}
                  onValueChange={(role) => setNewUser({ ...newUser, role })}
                  options={ROLE_OPTIONS}
                />
                <Button disabled={createUser.isPending} onClick={() => createUser.mutate()}>
                  Crear usuario
                </Button>
              </div>
            </div>
            {userError ? <p className="text-sm text-destructive">{userError}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
