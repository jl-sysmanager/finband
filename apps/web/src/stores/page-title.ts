import * as React from "react";
import { create } from "zustand";

type PageTitleState = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

export const usePageTitle = create<PageTitleState>((set) => ({
  title: null,
  setTitle: (title) => set({ title }),
}));

export function useSyncPageTitle(title: string | null | undefined) {
  const setTitle = usePageTitle((s) => s.setTitle);
  React.useEffect(() => {
    setTitle(title ?? null);
    return () => setTitle(null);
  }, [title, setTitle]);
}
