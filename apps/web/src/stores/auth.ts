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
    await api("/auth/logout", { method: "POST" });
    set({ user: null });
  },
  isAdmin: () => get().user?.role === "ADMIN",
}));
