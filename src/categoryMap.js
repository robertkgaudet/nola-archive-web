// The research agent emits free-text `likely_category` values — 334 distinct
// strings across 418 providers. Rendered raw they bury the provider list, so
// we collapse them into 12 display groups.
//
// Rules are ORDERED and first-match-wins; the order encodes the ambiguities:
//   - Dining before Venues, so `restaurant_event_venue` reads as a restaurant.
//   - Venues before Catering, so `catering_venue` reads as a venue.
//   - Activities before Entertainment, so `improv_comedy_team_building` reads
//     as team building rather than comedy.
//
// This is a display convenience only. It never touches the database, and the
// raw `categories` array is still shown in full on the provider detail pane.

export const GROUPS = [
  'Venues',
  'Dining',
  'Entertainment',
  'Activities & Tours',
  'Transportation',
  'Catering',
  'Photo & Video',
  'Decor & Rentals',
  'Production & AV',
  'Staffing',
  'Gifting',
  'Other'
];

const RULES = [
  ['Dining', /restaurant|dining|(^|_)bar(_|$)|cafe|deli|oyster|eatertainment|brunch|steakhouse/],

  ['Venues', /venue|ballroom|banquet|event_space|event_hall|event_complex|conference_center|conference$|convention_(event_)?center|meeting_space|museum|attraction|observation_deck|art_gallery|hotel|guest_house|coworking|workshop_space|country_club|golf|athletic_club|recreation_center|sports_facility|urban_farm|vacation_rental|historic_event|loft_|adaptive_reuse|concert_venue|music_venue|arts_venue|park_/],

  ['Activities & Tours', /tour|swamp|airboat|steamboat|riverboat|paddlewheel|team_building|scavenger|escape_room|murder_mystery|game_show|csr|volunteer|nonprofit|cooking_class|culinary_experience|culinary_team|experiential_class|tasting_event|eco_touris|kayak|adventure|excursion|outing|cruise|cultural_experience|cultural_education|interactive_art|motorsports|group_experience|paranormal|haunted|ghost|wildlife|challenge_course|activity/],

  ['Entertainment', /band|dj_|_dj|music|entertain|second_line|emcee|talent|artist_representation|modeling_agency|comedy|improv|variety|jazz|performer|performing_arts|costume/],

  ['Transportation', /transport|limousine|limo|shuttle|charter_bus|motorcoach|bus_service|carriage|black_car/],

  ['Catering', /cater|bartend|food_beverage|commissary|beverage|specialty_food|mobile_bar/],

  ['Photo & Video', /photo|videograph|video|drone|live_stream|portrait|headshot/],

  ['Decor & Rentals', /decor|floral|rental|linen|uniform|textile|furniture|tent|fabrication|signage/],

  ['Production & AV', /\bav_|_av_|audio|sound|lighting|staging|production|live_sound|event_design/],

  ['Staffing', /staffing|brand_ambassador|security|crowd_management|registration|promotional_staff|convention_sales/],

  ['Gifting', /gift|promotional_products|souvenir|artisan|retail|wholesale/]
];

const unmatched = new Set();

/** Collapse one raw category string into a display group. */
export function mapCategory(raw) {
  if (!raw) return 'Other';
  const s = String(raw).toLowerCase();
  for (const [group, re] of RULES) {
    if (re.test(s)) return group;
  }
  unmatched.add(s);
  return 'Other';
}

/**
 * A provider's display group. Providers carry ~2 tags on average; we take the
 * first tag that maps to something real so a stray unmatched tag doesn't push
 * an otherwise-classifiable provider into Other.
 */
export function groupForProvider(provider) {
  const cats = provider?.categories || [];
  for (const c of cats) {
    const g = mapCategory(c);
    if (g !== 'Other') return g;
  }
  return 'Other';
}

/** Raw values that matched no rule — logged once so the map can be tightened. */
export function reportUnmatched() {
  if (!unmatched.size) return [];
  const list = [...unmatched].sort();
  console.warn(
    `[categoryMap] ${list.length} raw category values fell through to "Other":`,
    list
  );
  return list;
}
