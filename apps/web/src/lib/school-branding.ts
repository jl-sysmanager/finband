export type SchoolBranding = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  hasLogo: boolean;
  updatedAt: string;
};

export function schoolLogoUrl(updatedAt?: string | null) {
  const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `/api/v1/settings/school/logo${v}`;
}
