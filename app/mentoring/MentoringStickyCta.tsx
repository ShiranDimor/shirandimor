'use client';

import { useEffect, useState } from 'react';

// כפתור צף קטן בתחתית המסך (בטלפון ובמחשב). מופיע אחרי הפתיח ונעלם כשמגיעים לאזור קביעת השיחה.
// כל עוד לא ראו את המחירים - מוביל למסלולים ולמחירים (כדי לא לדלג על המידע). אחרי שראו - לשיחת ההתאמה.
export default function MentoringStickyCta() {
  const [heroVisible, setHeroVisible] = useState(true);
  const [fitVisible, setFitVisible] = useState(false);
  const [seenPricing, setSeenPricing] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('top');
    const pricing = document.getElementById('pricing');
    const fit = document.getElementById('fit-call');
    if (!hero || !pricing || !fit || typeof IntersectionObserver === 'undefined') return;
    const heroObs = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0 });
    const pricingObs = new IntersectionObserver(([e]) => e.isIntersecting && setSeenPricing(true), { threshold: 0.2 });
    const fitObs = new IntersectionObserver(([e]) => setFitVisible(e.isIntersecting), { threshold: 0.05 });
    heroObs.observe(hero);
    pricingObs.observe(pricing);
    fitObs.observe(fit);
    return () => {
      heroObs.disconnect();
      pricingObs.disconnect();
      fitObs.disconnect();
    };
  }, []);

  const show = !heroVisible && !fitVisible;

  // מרים את כפתורי הוואטסאפ ודור מעל הפס כשהוא מוצג
  useEffect(() => {
    document.body.classList.toggle('mt-bar-on', show);
    return () => document.body.classList.remove('mt-bar-on');
  }, [show]);

  return (
    <div className={`sticky-cta mt-sticky${show ? ' is-on' : ''}`} aria-hidden={!show}>
      {seenPricing ? (
        <a href="#fit-call" data-cta="sticky-book" data-cta-kind="book" tabIndex={show ? 0 : -1}>
          לקביעת שיחת התאמה
        </a>
      ) : (
        <a href="#pricing" data-cta="sticky-pricing" tabIndex={show ? 0 : -1}>
          למסלולים ולמחירים ↓
        </a>
      )}
    </div>
  );
}
