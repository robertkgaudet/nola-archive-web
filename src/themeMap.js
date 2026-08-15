// Maps the 66 experience clusters onto NOLA DMC's own six service themes —
// the ones on her homepage and in her RFP form. Ordered, first match wins.
//
// This is a presentation grouping for the client-facing surface. It is not
// stored anywhere and never touches the database.

export const THEMES = [
  'Entertainment',
  'Excursions',
  'Parades & Permits',
  'Special Events',
  'Team Building/CSR',
  'Transportation'
];

export const THEME_BLURB = {
  'Entertainment': 'From traditional New Orleans jazz to agile dancers and dramatic performances.',
  'Excursions': 'Explore New Orleans and its surrounding areas with customized adventures.',
  'Parades & Permits': 'The most fun method of getting around — permits and parade elements, handled.',
  'Special Events': 'Inspired decor, unique venues, lively entertainment and complete logistics.',
  'Team Building/CSR': 'Whether you are building relationships or a community, make it motivating.',
  'Transportation': 'Top of the line transit with superior hospitality on every trip.'
};

const RULES = [
  ['Parades & Permits', /parade|second-line|second_line/],
  ['Transportation', /charter-bus|motorcoach|shuttle|limousine|black-car|transport|airport|aviation/],
  ['Team Building/CSR', /team-building|teambuilding|csr|volunteer|scavenger|escape-room|murder-mystery|culinary-team/],
  ['Excursions', /tour|swamp|airboat|plantation|riverboat|paddlewheel|cruise|walking|ghost|cemetery|adventure|outdoor|cooking-class|food-culinary/],
  ['Entertainment', /band|dj|emcee|jazz|music|entertainment|talent|booking-agenc|photo-booth|immersive|interactive|art-experience/],
  // everything else — venues, dining, catering, decor, AV, rentals, staffing,
  // gifting, photography, planning — is the Special Events umbrella
  ['Special Events', /.*/]
];

export function themeFor(slug) {
  const s = String(slug || '').toLowerCase();
  for (const [theme, re] of RULES) if (re.test(s)) return theme;
  return 'Special Events';
}
