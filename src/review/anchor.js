/**
 * Re-finding a highlight after the text around it has moved.
 *
 * The quoted text is the primary key, not the offset. Offsets break as soon as
 * a word is added earlier in the paragraph; the quote plus a little surrounding
 * context survives that. The stored offset is only a tie-breaker when the same
 * phrase appears more than once.
 *
 * Resolution order:
 *   1. the remembered paragraph, occurrence nearest the remembered offset
 *   2. context match — the occurrence whose neighbouring text still fits
 *   3. any other paragraph containing the quote
 *   4. null — the comment is reported as unanchored, and stays resolvable
 */

const CONTEXT = 40;

export function makeAnchor({ field, paraIndex, paragraph, start, end }) {
  return {
    field,
    paraIndex,
    start,
    end,
    quote: paragraph.slice(start, end),
    prefix: paragraph.slice(Math.max(0, start - CONTEXT), start),
    suffix: paragraph.slice(end, end + CONTEXT)
  };
}

const occurrences = (hay, needle) => {
  const out = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) { out.push(i); i = hay.indexOf(needle, i + 1); }
  return out;
};

/** Score how well the text around a candidate matches what we remembered. */
function contextScore(paragraph, at, anchor) {
  const before = paragraph.slice(Math.max(0, at - CONTEXT), at);
  const after = paragraph.slice(at + anchor.quote.length, at + anchor.quote.length + CONTEXT);
  let score = 0;
  const p = anchor.prefix || '', s = anchor.suffix || '';
  for (let i = 1; i <= Math.min(before.length, p.length); i++) {
    if (before.slice(-i) === p.slice(-i)) score = i; else break;
  }
  let sc = 0;
  for (let i = 1; i <= Math.min(after.length, s.length); i++) {
    if (after.slice(0, i) === s.slice(0, i)) sc = i; else break;
  }
  return score + sc;
}

/**
 * @param {object} anchor stored anchor
 * @param {string[]} paragraphs current paragraph texts for the same field
 * @returns {{paraIndex:number, start:number, end:number}|null}
 */
export function locate(anchor, paragraphs) {
  if (!anchor || !anchor.quote || !Array.isArray(paragraphs)) return null;
  const { quote } = anchor;

  // 1. remembered paragraph
  const home = paragraphs[anchor.paraIndex];
  if (typeof home === 'string') {
    const hits = occurrences(home, quote);
    if (hits.length === 1) return { paraIndex: anchor.paraIndex, start: hits[0], end: hits[0] + quote.length };
    if (hits.length > 1) {
      // prefer the one whose surroundings still match; fall back to nearest offset
      let best = hits[0], bestScore = -1;
      for (const at of hits) {
        const sc = contextScore(home, at, anchor);
        const closer = Math.abs(at - anchor.start) < Math.abs(best - anchor.start);
        if (sc > bestScore || (sc === bestScore && closer)) { best = at; bestScore = sc; }
      }
      return { paraIndex: anchor.paraIndex, start: best, end: best + quote.length };
    }
  }

  // 2/3. anywhere else in the field, best context wins
  let found = null, foundScore = -1;
  paragraphs.forEach((p, idx) => {
    if (typeof p !== 'string') return;
    for (const at of occurrences(p, quote)) {
      const sc = contextScore(p, at, anchor);
      if (sc > foundScore) { foundScore = sc; found = { paraIndex: idx, start: at, end: at + quote.length }; }
    }
  });
  return found;
}

/**
 * Split one paragraph into runs, each carrying the ids of the comments
 * covering it. Overlaps are handled by cutting at every boundary, so two
 * comments over the same words produce one run owned by both.
 */
export function segment(text, ranges) {
  if (!ranges.length) return [{ text, ids: [] }];
  const bounds = new Set([0, text.length]);
  for (const r of ranges) {
    bounds.add(Math.max(0, Math.min(text.length, r.start)));
    bounds.add(Math.max(0, Math.min(text.length, r.end)));
  }
  const cuts = [...bounds].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b <= a) continue;
    const ids = ranges.filter((r) => r.start <= a && r.end >= b).map((r) => r.id);
    out.push({ text: text.slice(a, b), ids });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Finding a quote inside the RAW markdown a textarea edits.
 *
 * locate() works in rendered space: toBlocks() has already stripped '#'
 * and '-' markers, joined soft-wrapped lines with a space, and dropped the
 * CTA token. The textarea holds the markdown before all of that, so a
 * rendered offset is not a raw offset and a plain indexOf() misses any
 * quote that spans a line break.
 *
 * Matching whitespace-flexibly closes the gap: every run of whitespace in
 * the quote matches any run in the raw text, so a line join costs nothing.
 * The resolution order is the same as locate() — quote first, context to
 * choose between repeats, remembered offset only as a tie-break.
 * ------------------------------------------------------------------ */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex matching `text` with any whitespace run standing in for any other. */
function flexRe(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map(esc).join('\\s+'), 'g');
}

/** Every whitespace-tolerant occurrence of `text` in `raw`. */
export function flexFindAll(raw, text) {
  const re = flexRe(text);
  if (!re) return [];
  const out = [];
  for (const m of String(raw).matchAll(re)) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** First whitespace-tolerant occurrence, or -1. */
export function flexIndex(raw, text) {
  const hits = flexFindAll(raw, text);
  return hits.length ? hits[0].start : -1;
}

/**
 * Score a candidate by how much of the remembered prefix/suffix still sits
 * around it. Both sides are whitespace-normalised so a line join in the raw
 * text still matches a space in the remembered context.
 */
function rawContextScore(raw, hit, anchor) {
  const norm = (s) => s.replace(/\s+/g, ' ');
  const before = norm(raw.slice(Math.max(0, hit.start - CONTEXT * 3), hit.start));
  const after = norm(raw.slice(hit.end, hit.end + CONTEXT * 3));
  const p = norm(anchor?.prefix || ''), s = norm(anchor?.suffix || '');
  let a = 0;
  for (let i = 1; i <= Math.min(before.length, p.length); i++) {
    if (before.slice(-i) === p.slice(-i)) a = i; else break;
  }
  let b = 0;
  for (let i = 1; i <= Math.min(after.length, s.length); i++) {
    if (after.slice(0, i) === s.slice(0, i)) b = i; else break;
  }
  return a + b;
}

/**
 * @param {object} anchor   the stored anchor (may be null)
 * @param {string} raw      the textarea's current value
 * @param {string} quote    fallback quote when the anchor has none
 * @param {number} [hint]   estimated raw offset, used only to break ties
 * @returns {{start:number, end:number}|null}
 */
export function locateInRaw(anchor, raw, quote, hint) {
  const needle = anchor?.quote || quote;
  if (!needle || !raw) return null;

  const hits = flexFindAll(raw, needle);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];

  let best = hits[0], bestScore = -1;
  for (const hit of hits) {
    const score = rawContextScore(raw, hit, anchor);
    const closer = Number.isFinite(hint)
      && Math.abs(hit.start - hint) < Math.abs(best.start - hint);
    if (score > bestScore || (score === bestScore && closer)) { best = hit; bestScore = score; }
  }
  return best;
}
