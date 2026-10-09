import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SchoolBranding } from "@/lib/school-branding";

export function useSchoolBranding() {
  return useQuery({
    queryKey: ["school-branding"],
    queryFn: () => api<SchoolBranding>("/settings/school/branding"),
    staleTime: 60_000,
  });
}
