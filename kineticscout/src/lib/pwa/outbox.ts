/**
 * Measurements logged without a connection wait here until the device is back online. Stored in
 * localStorage (small, synchronous, so sign-out can clear it reliably), tagged with the account
 * that logged them so they are never sent for someone else, and dropped after 30 days.
 */
export type OutboxEntry = { clientRef: string; userId: string; metricType: string; value: number; date: string; queuedAt: number }

const KEY = 'ks_outbox_v1'
const MAX_AGE_MS = 30 * 86_400_000
const MAX_ENTRIES = 50

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function store(): Store | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage
  } catch {
    return null
  }
}

export function readOutbox(storage: Store | null = store(), now: number = Date.now()): OutboxEntry[] {
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is OutboxEntry =>
        typeof e === 'object' && e !== null && typeof e.clientRef === 'string' && typeof e.userId === 'string' && typeof e.metricType === 'string' && typeof e.value === 'number' && typeof e.date === 'string' && typeof e.queuedAt === 'number' && now - e.queuedAt < MAX_AGE_MS,
    )
  } catch {
    return []
  }
}

function write(entries: OutboxEntry[], storage: Store | null) {
  if (!storage) return false
  try {
    if (entries.length === 0) storage.removeItem(KEY)
    else storage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
    return true
  } catch {
    return false
  }
}

/** Returns false when the device cannot store it (private mode, storage full). */
export function addToOutbox(entry: OutboxEntry, storage: Store | null = store()): boolean {
  return write([...readOutbox(storage).filter((e) => e.clientRef !== entry.clientRef), entry], storage)
}

/** Adds an entry stamped with the current time. */
export function queueEntry(entry: Omit<OutboxEntry, 'queuedAt'>, storage: Store | null = store()): boolean {
  return addToOutbox({ ...entry, queuedAt: Date.now() }, storage)
}

export function removeFromOutbox(clientRef: string, storage: Store | null = store()): void {
  write(readOutbox(storage).filter((e) => e.clientRef !== clientRef), storage)
}

export function pendingFor(userId: string, storage: Store | null = store()): OutboxEntry[] {
  return readOutbox(storage).filter((e) => e.userId === userId)
}

/** Called on sign-out so nothing is left on a shared device. */
export function clearOutbox(storage: Store | null = store()): void {
  try {
    storage?.removeItem(KEY)
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

export const OUTBOX_EVENT = 'ks-outbox-changed'
