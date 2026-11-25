export const PLATFORM_BANK_PHONE = '0592229436';

/** Normalize Eastern Arabic (٠-٩) and Persian (۰-۹) digits to ASCII 0-9. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0));
}

/** Format basis points as a 2-decimal percentage string (e.g. 350 -> 3.50٪). */
export function formatBpsPct(bps?: number | null): string {
  if (bps == null || !Number.isFinite(bps)) return '0.00٪';
  return `${(bps / 100).toFixed(2)}٪`;
}
