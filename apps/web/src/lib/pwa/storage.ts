type PersistentStorageManager = Pick<StorageManager, "persist"> &
  Partial<Pick<StorageManager, "persisted">>;

/**
 * Ask the browser to protect installed-app data from automatic eviction.
 * Unsupported browsers and rejected requests safely remain best-effort.
 */
export async function ensurePersistentStorage(
  storage: PersistentStorageManager | undefined,
): Promise<boolean> {
  if (!storage) return false;

  try {
    if (storage.persisted && (await storage.persisted())) return true;
  } catch {
    // A failed status check should not prevent the persistence request.
  }

  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/** Request durable browser storage when the Storage API is available. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  return ensurePersistentStorage(navigator.storage);
}
