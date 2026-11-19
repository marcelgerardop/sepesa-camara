const ZONE = 'America/Caracas';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface CaracasParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

export function caracasParts(date: Date): CaracasParts {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: map.year ?? '0000',
    month: (map.month ?? '1').padStart(2, '0'),
    day: (map.day ?? '1').padStart(2, '0'),
    hour: (map.hour ?? '0').padStart(2, '0'),
    minute: (map.minute ?? '0').padStart(2, '0'),
    second: (map.second ?? '0').padStart(2, '0'),
  };
}

/** Visible stamp, for example "19 nov 2026 · 11:09". */
export function stampLabel(date: Date): string {
  const parts = caracasParts(date);
  const month = MONTHS[Number(parts.month) - 1] ?? 'ene';
  const day = String(Number(parts.day));
  return `${day} ${month} ${parts.year} · ${parts.hour}:${parts.minute}`;
}

export function fileName(date: Date, ext: string): string {
  const parts = caracasParts(date);
  return `SEPESA_${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}.${ext}`;
}
