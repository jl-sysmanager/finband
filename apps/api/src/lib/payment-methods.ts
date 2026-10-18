import { prisma } from "./prisma.js";

/**
 * Error si el método de pago no se puede usar en un cobro o ingreso: no existe o
 * está desactivado. El valor que ya tenía el registro (`current`) sigue valiendo
 * aunque se haya desactivado después, para poder editar el resto del registro.
 */
export async function paymentMethodError(
  id: string | null | undefined,
  current?: string | null,
): Promise<string | null> {
  if (!id || id === current) return null;
  const method = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!method) return "Método de pago no válido";
  if (!method.active) return `El método de pago «${method.label}» está desactivado`;
  return null;
}
