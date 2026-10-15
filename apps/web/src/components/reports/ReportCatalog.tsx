import { reports } from "@/components/reports/report-catalog";

export function ReportCatalog({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {reports.map((r, i) => {
        const showHeader = r.group !== reports[i - 1]?.group;
        return (
          <div key={r.id}>
            {showHeader && r.group ? (
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {r.group}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={`block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                selectedId === r.id ? "bg-primary/10 font-medium text-primary" : ""
              }`}
            >
              {r.label}
            </button>
          </div>
        );
      })}
    </>
  );
}
