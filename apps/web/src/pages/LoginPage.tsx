import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/stores/auth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex flex-1 flex-col justify-center bg-sidebar px-8 py-12 text-sidebar-foreground md:px-12">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-sidebar-accent text-primary-foreground">
            <Music2 className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Finband</h1>
          <p className="mt-3 text-sidebar-muted">
            Gestión administrativa y económica de tu escuela de música: alumnos, clases, cobros e
            informes en un solo lugar.
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md border-border shadow-card">
          <CardHeader>
            <CardTitle>Acceso</CardTitle>
            <p className="text-sm text-muted-foreground">Introduce tus credenciales de usuario</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
