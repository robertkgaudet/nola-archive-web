import { useEffect } from 'react';
import { SiteHeader, SiteFooter, EndCta, IronRule } from './Shell.jsx';
import { FleurDeLis, GasLamp, Streetcar } from './Icons.jsx';
import './preview.css';

const STEPS = [
  { n: '01', t: 'Someone asks a real question', d: 'A planner opens an AI assistant and types what they actually need — “where can we host a rooftop reception for 150 in New Orleans?”' },
  { n: '02', icon: <GasLamp />, t: 'The answer lives on your site', d: 'You have already published a proper answer to that exact question, with the real detail: capacities, group sizes, formats, timings.' },
  { n: '03', icon: <Streetcar />, t: 'You are the one recommended', d: 'The assistant answers using the clearest, most specific source it can find — and points the planner to you.' },
  { n: '04', t: 'And the page invites them in', d: 'Every answer closes the same way: an invitation to request a proposal, so the interest turns into a conversation.' }
];

export default function Landing() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = document.querySelectorAll('.reveal');
    if (!nodes.length) return;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('in'));
      return;
    }
    document.body.dataset.reveal = 'armed';
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    nodes.forEach((n) => io.observe(n));
    const t = setTimeout(() => {
      document.querySelectorAll('.reveal:not(.in)').forEach((n) => {
        if (n.getBoundingClientRect().top < window.innerHeight * 1.5) n.classList.add('in');
      });
    }, 600);
    return () => { clearTimeout(t); io.disconnect(); };
  }, []);

  return (
    <div className="pv">
      <div className="pv-wrap">
        <SiteHeader active="overview" />

        <section className="pv-hero">
          <div className="pv-kicker">Answer Engine Optimisation</div>
          <h1>The question gets asked once.<br /><em>Someone gets recommended.</em></h1>
          <p className="pv-lede">
            More and more, the search starts with an assistant rather than a list of links —
            and the business with the clearest answer is the one that gets named.
          </p>
        </section>
      </div>

      <IronRule />

      {/* ---------- the heart of the page ---------- */}
      <div className="pv-wrap">
        <section className="pv-explain reveal">
          <h2 className="pv-h2">How people find you now</h2>

          <div className="pv-cols">
            <div>
              <p>
                For twenty years, finding a supplier meant typing a few words into a search box
                and working through a page of blue links. That habit is changing fast. People now
                ask an assistant — ChatGPT, or the AI answer sitting at the top of a search page —
                a full question, in plain words, the way they would ask a knowledgeable colleague.
              </p>
              <p>
                <em>Which New Orleans restaurants have a private room for thirty executives?</em>
                {' '}<em>Who can move four hundred people from the hotel to an offsite venue?</em>
                {' '}They ask it properly, and they expect a real answer — not ten links to sift through.
              </p>
              <p>
                And here is what matters commercially: they usually act on that answer. Whoever
                gets named in it has already won the shortlist before the planner has visited a
                single website.
              </p>
            </div>

            <div>
              <h3 className="pv-h3">So why does an assistant name one business and not another?</h3>
              <p>
                Because it is looking for the clearest, most specific answer to the exact question
                it was asked. Not the most advertised. Not the biggest. The one that actually
                answers.
              </p>
              <p>
                A page that says <em>“we offer unforgettable event experiences”</em> gives it
                nothing to work with. A page that says <em>“this room seats forty for dinner and
                eighty standing, a set menu is required over sixteen guests, and the balcony can be
                added for cocktails”</em> gives it something real to repeat — with a source
                attached. Specific, useful, verifiable answers are what get cited.
              </p>
              <p>
                That is the whole idea behind <strong>Answer Engine Optimisation</strong>: instead
                of competing for a position in a list of links, you publish the genuine answers to
                the questions your buyers are already asking, so you become the source those
                answers come from.
              </p>
            </div>
          </div>
        </section>
      </div>

      <IronRule tight />

      <div className="pv-wrap">
        <section className="pv-steps reveal">
          <h2 className="pv-h2">What that looks like in practice</h2>
          <div className="pv-step-grid">
            {STEPS.map((s) => (
              <div className="pv-step" key={s.n}>
                <div className="pv-step-head">
                  <span className="pv-step-n">{s.n}</span>
                  {s.icon && <span className="pv-step-mark">{s.icon}</span>}
                </div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
          <p className="pv-step-foot">
            None of it works on claims. It works because the answers are true, specific and
            checkable — which is exactly why they get quoted.
          </p>
        </section>
      </div>

      <IronRule />

      {/* ---------- see it live ---------- */}
      <div className="pv-wrap">
        <section className="pv-entries reveal">
          <div className="pv-band-label">See it in action</div>
          <h2 className="pv-h2">This approach, live</h2>
          <div className="pv-entry-grid">
            <a className="pv-entry" href="/collection">
              <span className="pv-entry-mark"><FleurDeLis /></span>
              <h3>The Answer Collection</h3>
              <p>
                The library of answers to what planners actually ask about bringing a group to
                New Orleans — written in your voice, built to publish to your own site, and every
                one of them ending at Request a Proposal.
              </p>
              <span className="pv-more">Open the collection →</span>
            </a>
            <a className="pv-entry" href="/panel">
              <span className="pv-entry-mark"><GasLamp /></span>
              <h3>The Content Control Panel</h3>
              <p>
                A live view of how much has been built, how deep it goes across each part of the
                business, what is ready for your sign-off, and what is publishing next.
              </p>
              <span className="pv-more">Open the panel →</span>
            </a>
          </div>
        </section>
      </div>

      <div className="pv-wrap">
        <EndCta line="Ready to talk about your programme?" />
        <SiteFooter />
      </div>
    </div>
  );
}
