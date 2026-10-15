const queues = new Map<string, Promise<void>>();

/**
 * Ejecuta `fn` en exclusión mutua por clave dentro de este proceso.
 *
 * La API corre en un único proceso sobre SQLite, así que basta para serializar
 * operaciones de lectura-cálculo-escritura (p. ej. dos cobros simultáneos de la
 * misma cuota). Si algún día hay varias instancias, habrá que moverlo a la base.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const current = previous.then(() => gate);
  queues.set(key, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (queues.get(key) === current) queues.delete(key);
  }
}
