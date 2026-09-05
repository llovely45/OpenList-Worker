/** Return true for persisted 115 Open Platform driver names. */
export function is115OpenDriverName(driverName: unknown): boolean {
  const normalized = String(driverName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
  return normalized === "115open" || normalized === "115pan"
}

/**
 * Canonicalize an existing storage after the 115 dispatcher fix.
 * The addition field is intentionally kept byte-for-byte unchanged so tokens
 * and other account-specific settings are not exposed or rewritten.
 */
export function repair115OpenStorage<T extends Record<string, any>>(
  storage: T,
  modified = new Date().toISOString(),
): T & { driver: "115Open"; modified: string } {
  return {
    ...storage,
    driver: "115Open",
    modified,
  }
}
