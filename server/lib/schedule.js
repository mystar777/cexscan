/** Next wall-clock slot (:00 or :30) strictly after `fromDate`. */
export function computeNextFetchAt(fromDate = new Date()) {
  const from = new Date(fromDate);
  const next = new Date(from);
  next.setSeconds(0, 0);

  if (next.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0, 0, 0);
  }

  if (next <= from) {
    if (next.getMinutes() === 0) {
      next.setMinutes(30, 0, 0);
    } else {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0, 0, 0);
    }
  }

  return next;
}
