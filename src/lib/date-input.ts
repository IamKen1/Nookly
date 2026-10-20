// <input type="date"> emits a value on every keystroke, so typing the year
// yields "0002-…", "0020-…", "0202-…" on the way to "2026-…". Treat only a
// full YYYY-MM-DD with a plausible year as ready to act on.
export const isCompleteDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900;
