export type RuntimeCacheLifetime = {
  waitUntil(promise: Promise<unknown>): void;
};

/**
 * Keep runtime Cache API writes attached to the originating service-worker
 * event without making the fresh network response wait on storage.
 */
export function attachRuntimeCacheWrite(
  event: RuntimeCacheLifetime,
  write: Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  event.waitUntil(
    write.catch((error: unknown) => {
      onError(error);
    }),
  );
}
