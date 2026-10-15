import { create } from "zustand";
import { api } from "@/lib/api";

export type AuthUser = {
  id: string;
  username: string;
  role: "ADMIN" | "READONLY";
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  fetchMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** La API ha rechazado la sesión: se descarta sin llamar al servidor. */
  expireSession: () => void;
  isAdmin: () => boolean;
};

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  fetchMe: async () => {
    try {
      const user = await api<AuthUser>("/auth/me");
      set({ user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  login: async (username, password) => {
    const user = await api<AuthUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    set({ user, loading: false });
  },
  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // Aunque falle la llamada, en este navegador la sesión se cierra igual.
    } finally {
      set({ user: null });
    }
  },
  expireSession: () => set({ user: null, loading: false }),
  isAdmin: () => get().user?.role === "ADMIN",
}));
