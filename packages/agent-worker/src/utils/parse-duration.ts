const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a shorthand duration string (e.g. "3d", "12h", "30m", "2w") into milliseconds.
 * Supports multiple segments: "1d12h" → 1 day + 12 hours.
 * Returns null for invalid input.
 */
export function parseDuration(input: string): number | null {
  const segments = input.trim().toLowerCase().match(/(\d+)\s*([smhdw])/g);
  if (!segments || segments.length === 0) return null;

  let total = 0;
  for (const seg of segments) {
    const match = seg.match(/^(\d+)\s*([smhdw])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    total += value * UNITS[unit];
  }

  return total > 0 ? total : null;
}
