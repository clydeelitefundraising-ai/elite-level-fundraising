'use client';

import { useEffect, useRef, useState } from 'react';

export default function StoryScroll() {
  const [active, setActive] = useState(0);
  const triggerRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    triggerRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(i);
        },
        { threshold: 0.55 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  const cls = (i: number) =>
    `ss-slide${active === i ? ' ss-slide--active' : ''}`;

  return (
    <section className="ss-section" aria-label="Our story">

      <div className="ss-inner">

        {/* ── LEFT: sticky display panel ── */}
        <div className="ss-sticky-col">
          <div className="ss-sticky">

            <div className="ss-slides-wrap">

              {/* 0 — Brand promise */}
              <div className={cls(0)}>
                <p className="ss-eyebrow">◆ Elite Level Fundraising</p>
                <h2 className="ss-headline">
                  RAISE <em>MORE.</em><br />
                  KEEP <em>MORE.</em><br />
                  WIN MORE.
                </h2>
                <p className="ss-body">
                  Arizona&rsquo;s premium sports fundraising platform.
                  Built different, priced fair, and designed to win.
                </p>
              </div>

              {/* 1 — Coaches */}
              <div className={cls(1)}>
                <p className="ss-eyebrow">◆ For Coaches &amp; ADs</p>
                <h2 className="ss-headline">
                  BUILT FOR<br />COACHES
                </h2>
                <p className="ss-body">
                  Launch campaigns faster, reduce manual work, and give
                  every athlete a clean donation experience.
                </p>
                <div className="ss-stats">
                  <div className="ss-stat">
                    <span className="ss-stat-val">48hr</span>
                    <span className="ss-stat-lbl">Setup Time</span>
                  </div>
                  <div className="ss-stat">
                    <span className="ss-stat-val">$0</span>
                    <span className="ss-stat-lbl">Upfront Cost</span>
                  </div>
                  <div className="ss-stat">
                    <span className="ss-stat-val">97%</span>
                    <span className="ss-stat-lbl">Payout Rate</span>
                  </div>
                </div>
              </div>

              {/* 2 — Donors */}
              <div className={cls(2)}>
                <p className="ss-eyebrow">◆ For Parents &amp; Donors</p>
                <h2 className="ss-headline">
                  MADE FOR<br />DONORS
                </h2>
                <p className="ss-body">
                  Fast checkout, clear team goals, athlete leaderboards,
                  sponsor visibility, and mobile-first donation pages.
                </p>
                <ul className="ss-bullets">
                  <li>Athlete leaderboards &amp; personal share links</li>
                  <li>One-tap mobile checkout via Stripe</li>
                  <li>Real-time campaign progress &amp; goal tracking</li>
                  <li>Sponsor recognition on every page</li>
                </ul>
              </div>

              {/* 3 — Arizona */}
              <div className={cls(3)}>
                <p className="ss-eyebrow">◆ Arizona Proud</p>
                <h2 className="ss-headline">
                  LOCAL TO<br />ARIZONA
                </h2>
                <p className="ss-body">
                  We understand Arizona schools, coaches, athletes, and
                  community businesses because we are built here.
                </p>
                <div className="ss-az-badge">
                  <span className="ss-az-icon" aria-hidden="true">🌵</span>
                  <span>Phoenix, Arizona</span>
                </div>
              </div>

              {/* 4 — CTA */}
              <div className={cls(4)}>
                <p className="ss-eyebrow">◆ Get Started</p>
                <h2 className="ss-headline">
                  READY TO<br /><em>START?</em>
                </h2>
                <p className="ss-body">
                  Book a demo and see what your next campaign could look like.
                  No commitment. No upfront cost.
                </p>
                <a href="#contact" className="elf-btn elf-btn-primary elf-btn-lg">
                  Request a Free Demo →
                </a>
              </div>

            </div>

            {/* Progress dots — inside sticky panel, right edge */}
            <nav className="ss-dots" aria-label="Story progress">
              {[0, 1, 2, 3, 4].map((i) => (
                <button
                  key={i}
                  className={`ss-dot${active === i ? ' ss-dot--active' : ''}`}
                  onClick={() =>
                    triggerRefs.current[i]?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'center',
                    })
                  }
                  aria-label={`Go to story slide ${i + 1} of 5`}
                  aria-current={active === i ? 'true' : undefined}
                />
              ))}
            </nav>

          </div>
        </div>

        {/* ── RIGHT: invisible scroll trigger zones ── */}
        <div className="ss-scroll-col" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              ref={(el) => { triggerRefs.current[i] = el; }}
              className="ss-trigger"
            />
          ))}
        </div>

      </div>

    </section>
  );
}
