import { useState } from 'react';

export const prettyTag = (t) => t.replace(/_/g, ' ');

const TOP_N = 20;

/**
 * Collapsed-by-default pill wall over the raw category tags.
 *
 * Scoping: when a display group is selected upstream, `tags` is already
 * narrowed to that group, so the wall is short and every pill is relevant.
 * With "All categories" it shows the most-used tags behind a "show all".
 *
 * Active pills stay visible in the toggle line while collapsed, so a filter
 * can never be silently applied behind a closed panel.
 */
export default function Refine({ tags, selected, onToggle, onClear, scoped }) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visible = scoped || showAll ? tags : tags.slice(0, TOP_N);
  const hiddenCount = tags.length - visible.length;

  return (
    <div className="refine">
      <div className="refine-bar">
        <button className="refine-toggle" onClick={() => setOpen((o) => !o)}>
          <span className={`caret ${open ? 'open' : ''}`}>▸</span> Refine
          <span className="refine-n">({tags.length} tag{tags.length === 1 ? '' : 's'})</span>
        </button>

        {selected.map((t) => (
          <button
            key={t}
            className="pill on active-chip"
            onClick={() => onToggle(t)}
            title={`Remove ${prettyTag(t)}`}
          >
            {prettyTag(t)} <span className="x">×</span>
          </button>
        ))}
        {selected.length > 1 && (
          <button className="clear-all" onClick={onClear}>clear</button>
        )}
      </div>

      {open && (
        <div className="refine-panel">
          {visible.map(({ tag, count }) => (
            <button
              key={tag}
              className={`pill ${selected.includes(tag) ? 'on' : ''}`}
              onClick={() => onToggle(tag)}
            >
              {prettyTag(tag)} <b>{count}</b>
            </button>
          ))}
          {!scoped && hiddenCount > 0 && !showAll && (
            <button className="show-all" onClick={() => setShowAll(true)}>
              show all {tags.length} tags
            </button>
          )}
          {tags.length === 0 && <div className="count">No tags in this selection.</div>}
        </div>
      )}
    </div>
  );
}
