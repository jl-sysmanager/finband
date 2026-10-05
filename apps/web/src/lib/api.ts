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
