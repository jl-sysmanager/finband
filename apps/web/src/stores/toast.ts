import { create } from "zustand";

export type ToastItem = {
  id: string;
  message: string;
  variant?: "default" | "success" | "error";
};

type ToastState = {
  items: ToastItem[];
  push: (message: string, variant?: ToastItem["variant"]) => void;
  dismiss: (id: string) => void;
};

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (message, variant = "default") => {
    const id = crypto.randomUUID();
    set((s) => ({ items: [...s.items, { id, message, variant }] }));
    window.setTimeout(() => {
      set((s) => ({ items: s.items.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export function toast(message: string, variant?: ToastItem["variant"]) {
  useToast.getState().push(message, variant);
}
