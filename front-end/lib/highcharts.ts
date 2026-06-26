/**
 * Timestamp utilities — IST (UTC+5:30).
 */

/**
 * Parse a DB timestamp string (IST, no timezone suffix) to epoch ms.
 * e.g. "2025-01-01 09:15:00" → epoch ms
 */
export function istToMs(t: string): number {
  return new Date(t.replace(" ", "T") + "+05:30").getTime();
}
