export function toDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
