const DATE_OPTS = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

export function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", DATE_OPTS);
}
