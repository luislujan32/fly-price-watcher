const AIRPORT_CODE_PATTERN = /^[A-Z]{3}$/;

export function parseAirportCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return AIRPORT_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function parseDateInput(value: string, now = new Date()): Date | null {
  const trimmed = value.trim();
  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const dashMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const match = slashMatch
    ? { day: Number(slashMatch[1]), month: Number(slashMatch[2]), year: Number(slashMatch[3]) }
    : dashMatch
      ? { day: Number(dashMatch[3]), month: Number(dashMatch[2]), year: Number(dashMatch[1]) }
      : null;
  if (!match) {
    return null;
  }

  const { day, month, year } = match;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return isPastDate(date, now) ? null : date;
}

export function parseAdultCount(value: string): number | null {
  const trimmed = value.trim();
  const number = trimmed ? Number(trimmed) : 1;
  return Number.isInteger(number) && number >= 1 && number <= 9 ? number : null;
}

export function parseTargetPrice(value: string): number | undefined | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'omitir') {
    return undefined;
  }
  const number = Number(trimmed);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function formatDate(value: Date): string {
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${value.getUTCFullYear()}`;
}

function isPastDate(date: Date, now: Date): boolean {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  return candidate.getTime() < today.getTime();
}
