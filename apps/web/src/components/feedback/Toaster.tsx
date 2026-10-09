import { useToast } from "@/stores/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-sm flex-col gap-2 md:bottom-6 md:right-6"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur",
            t.variant === "success" && "border-success/30 bg-card text-foreground",
            t.variant === "error" && "border-destructive/40 bg-card text-destructive",
            (!t.variant || t.variant === "default") && "border-border bg-card",
          )}
        >
          <button type="button" className="w-full text-left" onClick={() => dismiss(t.id)}>
            {t.message}
          </button>
        </div>
      ))}
    </div>
  );
}
