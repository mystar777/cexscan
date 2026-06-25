/** Next wall-clock interval boundary strictly after `fromDate`. */
export function computeNextFetchAt(fromDate = new Date(), intervalMinutes = 60) {
  const from = new Date(fromDate);
  const intervalMs = Math.max(1, Number(intervalMinutes) || 60) * 60 * 1000;
  const nextMs = Math.floor(from.getTime() / intervalMs) * intervalMs + intervalMs;
  return new Date(nextMs);
}
