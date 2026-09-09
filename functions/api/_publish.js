/**
 * Pushing a page to WordPress as a future-dated post.
 *
 * Files under functions/ whose name starts with "_" are not routed, so this is
 * a helper for director.js rather than an endpoint of its own. Nothing here is
 * reachable from the browser.
 *
 * This mirrors src/wp-publish.js in the pipeline repo, including its dual
 * Authorization / X-Authorization header trick — some origins strip the
 * standard header before PHP sees it, and the companion plugin reads either.
 * The two live in different runtimes (Node vs the edge) so they cannot share a
 * file; if the auth approach changes in one, it has to change in the other.
 *
 * The application password is read from env only. It is never returned to the
 * browser and never logged; failures report status and WordPress error codes.
 */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown: links, bold, italic, code. Applied to already-escaped text. */
function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${href}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Markdown -> HTML for post_content.
 *
 * Deliberately small: the generator only ever emits headings, paragraphs,
 * bullet lists and inline emphasis, so a full markdown engine would be a
 * dependency earning nothing. Anything it does not recognise stays as a
 * paragraph rather than being dropped.
 */
export function mdToHtml(md, ctaUrl) {
  const src = String(md || '').replace(/\r/g, '');
  const out = [];
  let para = [];
  let list = [];

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${inline(esc(para.join(' ')))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>\n${list.map((li) => `<li>${inline(esc(li))}</li>`).join('\n')}\n</ul>`);
    list = [];
  };
  const flush = () => { flushPara(); flushList(); };

  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();

    // The CTA token is the one thing the generator is told to emit verbatim,
    // so it is replaced here rather than left for a human to remember.
    if (line.includes('{{CTA_RFP}}')) {
      flush();
      if (ctaUrl) {
        out.push(`<p><a href="${ctaUrl}">Request a Proposal</a></p>`);
      }
      continue;
    }

    if (!line.trim()) { flush(); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      // WordPress renders the post title as the H1, and every generated page
      // uses "##" for its sections, so those map straight to H2. A stray "#"
      // is demoted rather than emitted, since a second H1 in the body would
      // compete with the title.
      const level = Math.max(2, Math.min(6, h[1].length));
      out.push(`<h${level}>${inline(esc(h[2]))}</h${level}>`);
      continue;
    }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flushPara(); list.push(li[1]); continue; }

    flushList();
    para.push(line.trim());
  }
  flush();
  return out.join('\n\n');
}

function authHeader(env) {
  // The spaces in a WordPress application password are significant — do not strip.
  return 'Basic ' + btoa(`${env.WP_USER}:${env.WP_APP_PASSWORD}`);
}

export function wpConfigured(env) {
  return !!(env.WP_BASE_URL && env.WP_USER && env.WP_APP_PASSWORD);
}

async function wp(env, path, { method = 'GET', body } = {}) {
  const base = String(env.WP_BASE_URL).replace(/\/+$/, '');
  const auth = authHeader(env);
  const res = await fetch(`${base}/wp-json${path}`, {
    method,
    headers: {
      Authorization: auth,
      'X-Authorization': auth,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* an HTML error page */ }

  if (!res.ok) {
    const code = data?.code || `http_${res.status}`;
    // rest_not_logged_in means WordPress finished the request as an anonymous
    // user. On this stack (nginx + PHP-FPM behind Cloudflare) the Authorization
    // header is confirmed to reach PHP, so the credential is the thing to check,
    // not transport.
    if (res.status === 401 && code === 'rest_not_logged_in') {
      throw new Error('401 rest_not_logged_in — WordPress received the request as anonymous; '
        + 'the credential was not accepted. Verify WP_USER is the exact login of the user who '
        + 'owns the application password, and that WP_APP_PASSWORD has not been revoked or '
        + 'regenerated in wp-admin. (nginx + PHP-FPM behind Cloudflare — no .htaccess applies.)');
    }
    throw new Error(`${res.status} ${code}: ${String(data?.message || text).slice(0, 160)}`);
  }
  return data;
}

/** Confirm the credential works. Returns the authenticated account. */
export async function wpWhoAmI(env) {
  return wp(env, '/wp/v2/users/me?context=edit');
}

/**
 * Find an existing post for this slug, in any state.
 *
 * The stored wp_post_id is the first defence against double-posting, but it is
 * written after the post is created — so a failure in that gap leaves a real
 * post on the site the archive has no record of, and the next push would make a
 * second one. Asking WordPress what it already has closes that window.
 * Duplicating posts on a client's live blog is not an acceptable failure mode.
 */
export async function wpFindBySlug(env, slug) {
  const found = await wp(env, `/wp/v2/posts?slug=${encodeURIComponent(slug)}&status=any&per_page=1`);
  return Array.isArray(found) && found.length ? found[0] : null;
}

/**
 * Create one future-dated post.
 * WordPress releases a `future` post itself when its date arrives, which is
 * what makes the drip work without anything having to run on the day.
 */
export async function wpCreateFuturePost(env, { title, slug, html, date, categoryId, metaDescription }) {
  const body = { title, content: html, status: 'future', date };
  if (slug) body.slug = slug;
  if (categoryId) body.categories = [Number(categoryId)];
  if (metaDescription) body.meta = { _seopress_titles_desc: metaDescription };

  try {
    return await wp(env, '/wp/v2/posts', { method: 'POST', body });
  } catch (e) {
    // If the SEO meta field is not registered for REST, the post itself is
    // still worth creating — losing a description is not worth failing on.
    if (metaDescription && /meta|_seopress/i.test(e.message)) {
      delete body.meta;
      const post = await wp(env, '/wp/v2/posts', { method: 'POST', body });
      post._metaDescriptionApplied = false;
      return post;
    }
    throw e;
  }
}
