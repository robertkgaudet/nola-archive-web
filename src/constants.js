// Fixed display order: who they are, then the numbers a planner needs, then
// operational constraints, then colour. related_property sits last because it
// describes a DIFFERENT property and must never read as this provider's own.
export const FACET_ORDER = [
  'identity',
  'capacity',
  'group_size',
  'pricing_signal',
  'booking_constraint',
  'venue_format',
  'amenity',
  'accessibility',
  'duration',
  'seasonal',
  'neighborhood',
  'service',
  'unique_attribute',
  'other',
  'related_property'
];

export const FACET_LABELS = {
  identity: 'Identity',
  capacity: 'Capacity',
  group_size: 'Group size',
  pricing_signal: 'Pricing signals',
  booking_constraint: 'Booking constraints',
  venue_format: 'Venue format',
  amenity: 'Amenities',
  accessibility: 'Accessibility',
  duration: 'Duration',
  seasonal: 'Seasonal',
  neighborhood: 'Neighborhood',
  service: 'Service',
  unique_attribute: 'Distinguishing attributes',
  other: 'Other',
  related_property: 'Related property — NOT this provider'
};

export const orderOf = (t) => {
  const i = FACET_ORDER.indexOf(t);
  return i === -1 ? FACET_ORDER.length : i;
};

// list price, matching the pipeline's cost ledger
export const runCost = (r) =>
  (r.input_tokens / 1e6) * 3 +
  (r.output_tokens / 1e6) * 15 +
  (r.cache_read_tokens / 1e6) * 0.3 +
  (r.searches_used / 1000) * 10;

export const fmt = (n) => n.toLocaleString('en-US');
