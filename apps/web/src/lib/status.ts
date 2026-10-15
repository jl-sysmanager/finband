/** Variante de Badge para el estado de una cuota o liquidación. */
export function feeStatusBadge(status: string) {
  switch (status) {
    case "PAID":
      return "success" as const;
    case "PARTIAL":
      return "warning" as const;
    case "PENDING":
      return "destructive" as const;
    default:
      return "default" as const;
  }
}
