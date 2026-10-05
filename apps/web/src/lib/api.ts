export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let body: { error?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* binary */
    }
    throw new ApiError(body.error ?? "Error de servidor", res.status, body.details);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res as unknown as T;
}

export function downloadUrl(path: string) {
  return `/api/v1${path}`;
}

export async function uploadBackup(file: File): Promise<{ ok: boolean; message?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/v1/admin/backup/restore", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(body.error ?? "Error al restaurar", res.status);
  }
  return res.json() as Promise<{ ok: boolean; message?: string }>;
}
