import { create } from "zustand";
import { persist } from "zustand/middleware";

type ThemeState = {
  theme: "light" | "dark";
  toggle: () => void;
  apply: () => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      toggle: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        get().apply();
      },
      apply: () => {
        const root = document.documentElement;
        if (get().theme === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
      },
    }),
    { name: "finband-theme" },
  ),
);
