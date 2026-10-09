import { Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { schoolLogoUrl } from "@/lib/school-branding";

type Props = {
  name: string;
  hasLogo: boolean;
  updatedAt?: string | null;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  subtitle?: string;
  className?: string;
};

const sizes = {
  sm: { box: "h-9 w-9", img: "h-9 w-9 max-w-[120px]", icon: "h-4 w-4", title: "text-sm" },
  md: { box: "h-10 w-10", img: "h-10 max-w-[140px]", icon: "h-5 w-5", title: "text-sm" },
  lg: { box: "h-12 w-12", img: "h-12 max-w-[200px]", icon: "h-7 w-7", title: "text-3xl" },
};

export function SchoolLogo({
  name,
  hasLogo,
  updatedAt,
  size = "md",
  showName = true,
  subtitle,
  className,
}: Props) {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {hasLogo ? (
        <img
          src={schoolLogoUrl(updatedAt)}
          alt=""
          className={cn("shrink-0 rounded-lg bg-card object-contain object-left", s.img)}
        />
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-primary-foreground",
            s.box,
          )}
        >
          <Music2 className={s.icon} />
        </div>
      )}
      {showName ? (
        <div className="min-w-0">
          <p className={cn("truncate font-semibold", s.title)}>{name}</p>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
