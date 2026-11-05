/**
 * Date helpers.
 *
 * Calendar dates (purchase date, service date, warranty expiry...) are stored as
 * midnight UTC of that calendar day. "Today" is taken from the server's local
 * calendar date, so a server running in India treats 31 Oct as today all day long.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the server's current local calendar date. */
export function todayUTC(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Normalises any date to midnight UTC of the same UTC calendar day. */
export function startOfDayUTC(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from, to) {
  return Math.round((startOfDayUTC(to) - startOfDayUTC(from)) / DAY_MS);
}

/** First day (UTC) of the month that is `monthsBack` months before the current month. */
export function startOfMonthUTC(monthsBack = 0, now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() - monthsBack, 1));
}

/**
 * Warranty status calculated from the stored expiry date.
 *   active   - more than `windowDays` days remaining
 *   expiring - between 0 and `windowDays` days remaining (still valid)
 *   expired  - expiry date is in the past
 *   none     - no warranty recorded
 */
export function getWarrantyInfo(warrantyExpiry, windowDays) {
  if (!warrantyExpiry) {
    return { status: 'none', label: 'No warranty', remainingDays: null };
  }
  const remainingDays = daysBetween(todayUTC(), warrantyExpiry);
  if (remainingDays < 0) return { status: 'expired', label: 'Expired', remainingDays };
  if (remainingDays <= windowDays) return { status: 'expiring', label: 'Expiring soon', remainingDays };
  return { status: 'active', label: 'Active', remainingDays };
}

/** MongoDB filter matching a warranty status (same rules as getWarrantyInfo). */
export function warrantyStatusFilter(status, windowDays) {
  const today = todayUTC();
  const windowEnd = addDays(today, windowDays);
  switch (status) {
    case 'active':
      return { warrantyExpiry: { $gt: windowEnd } };
    case 'expiring':
      return { warrantyExpiry: { $gte: today, $lte: windowEnd } };
    case 'expired':
      return { warrantyExpiry: { $lt: today } };
    case 'none':
      return { warrantyExpiry: null };
    default:
      return {};
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "05 Oct 2026" (same output on every operating system and locale). */
export function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Oct 2026" style label for a year/month pair (month is 1-12). */
export function monthLabel(year, month) {
  return `${MONTHS[month - 1]} ${year}`;
}
