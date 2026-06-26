/**
 * Identity matching for cancel / modify flows. The PHONE is the strict factor;
 * the NAME is lenient, because Malayalam speech-to-text returns different Unicode
 * spellings of the same spoken name across calls (e.g. ധ↔ദ, dropped chillu ർ, or
 * conjunct variants), so an exact name match locks legitimate owners out of their
 * own bookings. We keep the phone exact and let the name be close-enough.
 */

/** Normalize a name: Unicode NFC, lowercase (a no-op for Malayalam), collapse spaces, trim. */
function normName(s: string): string {
  return (s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Digits only, last 10 (so country code / spacing / punctuation don't matter). */
export function phoneDigits(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

/**
 * STRICT phone identity: the supplied number must have at least 7 digits and its
 * last 10 must equal the stored number's last 10.
 */
export function phoneMatches(stored: string, supplied: string): boolean {
  const s = phoneDigits(supplied);
  return s.length >= 7 && phoneDigits(stored) === s;
}

/** Levenshtein edit distance (insert / delete / substitute) over code points.
 *  Malayalam lives in the BMP, so JS UTF-16 units == code points here. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1, // deletion
        dp[j - 1] + 1, // insertion
        prev + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * LENIENT name identity (the phone is the strict factor). The supplied name
 * matches the stored name if, after normalization, any of these hold:
 *   1. they are equal;
 *   2. one contains the other (handles first-name vs full-name, both ≥ 3 chars);
 *   3. their edit distance is within ~1 per 3 characters of the shorter name
 *      (absorbs the Malayalam ASR spelling drift).
 * Empty input never matches.
 */
export function nameMatches(stored: string, supplied: string): boolean {
  const a = normName(stored);
  const b = normName(supplied);
  if (!a || !b) return false;
  if (a === b) return true;
  if ((a.includes(b) && b.length >= 3) || (b.includes(a) && a.length >= 3)) return true;
  const tolerance = Math.max(1, Math.floor(Math.min(a.length, b.length) / 3));
  return levenshtein(a, b) <= tolerance;
}
