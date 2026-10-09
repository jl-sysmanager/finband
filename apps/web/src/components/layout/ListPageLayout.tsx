import type { ReactNode } from "react";
import { ListShell } from "@/components/layout/PageShell";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function ListPageLayout(props: Props) {
  return <ListShell {...props} />;
}
