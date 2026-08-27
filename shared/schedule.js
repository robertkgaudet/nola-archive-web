/**
 * Working out which page goes out on which day.
 *
 * Imported by BOTH the scheduler screen and the edge function. The preview the
 * director approves and the dates actually written must come from the same
 * code — if the browser computed the calendar and the server trusted it, a
 * tampered request could put any date on any page. So the browser sends only
 * the parameters, the server recomputes, and both call this.
 *
 * Dates are built from parts in UTC rather than parsed from strings. A local
 * `new Date('2026-09-01')` lands on the previous evening west of Greenwich,
 * which would quietly shift a whole schedule back a day.
 */

const DAY = 86400000;

/** 'YYYY-MM-DD' -> a UTC midnight timestamp. */
export function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

const isWeekend = (t) => {
  const d = new Date(t).getUTCDay();
  return d === 0 || d === 6;
};

/** Push a Saturday or Sunday forward to the following Monday. */
const toWeekday = (t) => {
  let x = t;
  while (isWeekend(x)) x += DAY;
  return x;
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * WordPress reads `date` as site-local time, so this is deliberately a naive
 * local timestamp with no zone suffix. Adding a Z would shift every post by
 * the site's offset.
 */
function stamp(t, hour) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    + `T${pad(hour)}:00:00`;
}

export const SCHEDULE_LIMITS = {
  everyDays: { min: 1, max: 30 },
  perRelease: { min: 1, max: 3 },
  hour: { min: 0, max: 23 }
};

/** Clamp and sanity-check the knobs. Returns { ok, error, opts }. */
export function normalizeOptions(o = {}) {
  const everyDays = Math.trunc(Number(o.everyDays));
  const perRelease = Math.trunc(Number(o.perRelease));
  const hour = o.hour === undefined ? 9 : Math.trunc(Number(o.hour));
  const start = parseDay(o.startDate);

  if (!start) return { ok: false, error: 'Start date must be YYYY-MM-DD.' };
  if (!Number.isFinite(everyDays) || everyDays < 1 || everyDays > 30) {
    return { ok: false, error: 'Release every N days must be a whole number from 1 to 30.' };
  }
  if (!Number.isFinite(perRelease) || perRelease < 1 || perRelease > 3) {
    return { ok: false, error: 'Posts per release must be 1, 2 or 3.' };
  }
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return { ok: false, error: 'Hour must be 0–23.' };
  }
  return {
    ok: true,
    opts: { startDate: o.startDate, everyDays, perRelease, hour, skipWeekends: !!o.skipWeekends }
  };
}

/**
 * @param {string[]} slugs   in the order they should go out
 * @param {object} o         { startDate, everyDays, perRelease, skipWeekends, hour }
 * @returns {{slug: string, date: string}[]}
 */
export function computeSchedule(slugs, o) {
  const { startDate, everyDays, perRelease, skipWeekends, hour } = o;
  const start = parseDay(startDate);
  if (start === null) return [];

  const out = [];
  let cursor = start;
  let i = 0;

  while (i < slugs.length) {
    if (skipWeekends) cursor = toWeekday(cursor);

    // Several posts in one release are spaced two hours apart rather than
    // stacked on the same minute, so a reader's feed does not show three
    // identical timestamps.
    for (let k = 0; k < perRelease && i < slugs.length; k++, i++) {
      out.push({ slug: slugs[i], date: stamp(cursor, Math.min(23, hour + k * 2)) });
    }
    cursor += everyDays * DAY;
  }
  return out;
}

/** Group a schedule into calendar rows: one entry per date. */
export function byDate(schedule) {
  const map = new Map();
  for (const s of schedule) {
    const day = s.date.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(s);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}
