function jalaliToGregorianParts(jy: number, jm: number, jd: number): [number, number, number] {
  const y = jy + 1595;
  let days = -355668 + 365 * y + Math.floor(y / 33) * 8 + Math.floor(((y % 33) + 3) / 4) + jd
    + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  let remaining = gd;
  while (gm < 12 && remaining > monthDays[gm]) {
    remaining -= monthDays[gm++];
  }
  return [gy, gm + 1, remaining];
}

export function jalaliToGregorianDate(value: string): Date | null {
  const normalized = value.trim().replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  const match = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return null;

  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);

  if (jy < 1 || jm < 1 || jm > 12 || jd < 1) return null;
  const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : 30;
  if (jd > maxDay) return null;

  // Esfand 30 only exists in a leap Jalali year. We determine it by
  // comparing the Gregorian start of this Jalali year with the next one.
  if (jm === 12 && jd === 30) {
    const [g1y, g1m, g1d] = jalaliToGregorianParts(jy, 1, 1);
    const [g2y, g2m, g2d] = jalaliToGregorianParts(jy + 1, 1, 1);
    const start = Date.UTC(g1y, g1m - 1, g1d);
    const next = Date.UTC(g2y, g2m - 1, g2d);
    if (Math.round((next - start) / 86400000) !== 366) return null;
  }

  const [gy, gm, gd] = jalaliToGregorianParts(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

export function todayJalaliInput(): string {
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}/${get("month")}/${get("day")}`;
}

export function formatJalaliInput(value: string): string {
  const digits = value
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^0-9]/g, "")
    .slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
}

export function toPersianDigits(value: string): string {
  return value.replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
