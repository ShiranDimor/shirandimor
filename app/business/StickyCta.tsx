'use client';

import { useEffect, useState } from 'react';

// פס צף עם הקריאה לפעולה: מופיע אחרי שגוללים מתחת לפתיח, ונעלם כשמגיעים לחלק של קביעת השיחה.
// בטלפון - בתחתית המסך (עם וואטסאפ). במחשב - פס עליון דק.
export default function StickyCta({ whatsappUrl }: { whatsappUrl: string }) {
  const [heroVisible, setHeroVisible] = useState(true);
  const [contactVisible, setContactVisible] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('.biz-hero');
    const contact = document.getElementById('contact');
    if (!hero || !contact || typeof IntersectionObserver === 'undefined') return;

    const heroObs = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0 });
    const contactObs = new IntersectionObserver(([e]) => setContactVisible(e.isIntersecting), { threshold: 0.05 });
    heroObs.observe(hero);
    contactObs.observe(contact);
    return () => {
      heroObs.disconnect();
      contactObs.disconnect();
    };
  }, []);

  const show = !heroVisible && !contactVisible;

  // מסמן את הגוף כדי להרים את הבועה של דור מעל הפס בטלפון
  useEffect(() => {
    document.body.classList.toggle('biz-bar-on', show);
    return () => document.body.classList.remove('biz-bar-on');
  }, [show]);

  return (
    <div className={`biz-sticky${show ? ' is-on' : ''}`} aria-hidden={!show}>
      <div className="biz-sticky-inner">
        <span className="biz-sticky-brand">
          <svg width="28" height="20" viewBox="0 0 40 28" aria-hidden="true">
            <rect x="0" y="0" width="40" height="6" rx="3" fill="#C0533D" />
            <rect x="8" y="11" width="32" height="6" rx="3" fill="#4E7262" />
            <rect x="16" y="22" width="24" height="6" rx="3" fill="#C0533D" />
          </svg>
          שירן דימור, הרצאות לארגונים
        </span>
        <div className="biz-sticky-actions">
          <a className="biz-btn biz-btn-primary biz-sticky-cta" href="#contact" tabIndex={show ? 0 : -1}>
            לתיאום שיחת התאמה
          </a>
          <a
            className="biz-sticky-wa"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="וואטסאפ"
            tabIndex={show ? 0 : -1}
          >
            <img src="/whatsapp-icon.svg" alt="" width="22" height="22" />
          </a>
        </div>
      </div>
    </div>
  );
}
