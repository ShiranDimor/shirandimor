'use client';

import { useEffect, useRef, useState } from 'react';

type Props = { whatsappUrl: string; phoneDisplay: string; phoneTel: string; email: string; emailSubject: string };

// בטלפון: הכפתורים פותחים חיוג/מייל כרגיל. במחשב קישורי tel/mailto לרוב לא עושים כלום (אין תוכנת מייל
// או חייגן מוגדרים) - לכן לחיצה מעתיקה את הפרט, ולמייל מציעה גם לפתוח ב-Gmail או Outlook בדפדפן.
export default function ContactButtons({ whatsappUrl, phoneDisplay, phoneTel, email, emailSubject }: Props) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState<'email' | 'phone' | null>(null);
  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsDesktop(mq.matches);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener?.('change', onChange);
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      mq.removeEventListener?.('change', onChange);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function copy(kind: 'email' | 'phone', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied((c) => (c === kind ? null : c)), 2500);
    } catch {
      setCopied(null);
    }
  }

  function onDesktopClick(kind: 'email' | 'phone', text: string) {
    return (e: React.MouseEvent) => {
      if (!isDesktop) return; // בטלפון - ההתנהגות הרגילה של הקישור
      e.preventDefault();
      copy(kind, text);
      setOpen((o) => (o === kind ? null : kind));
    };
  }

  const subject = encodeURIComponent(emailSubject);
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}`;
  const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(email)}&subject=${subject}`;

  return (
    <div className="biz-contact-links" ref={wrapRef}>
      <a className="biz-btn biz-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
        וואטסאפ
      </a>

      <div className="biz-pop-wrap">
        <a
          className="biz-btn biz-btn-ghost"
          href={`tel:${phoneTel}`}
          dir="ltr"
          onClick={onDesktopClick('phone', phoneDisplay)}
          aria-expanded={isDesktop ? open === 'phone' : undefined}
        >
          {phoneDisplay}
        </a>
        {isDesktop && open === 'phone' && (
          <div className="biz-pop" role="status">
            {copied === 'phone' ? 'המספר הועתק' : 'המספר'}: <span dir="ltr">{phoneDisplay}</span>
          </div>
        )}
      </div>

      <div className="biz-pop-wrap">
        <a
          className="biz-btn biz-btn-ghost"
          href={`mailto:${email}?subject=${subject}`}
          onClick={onDesktopClick('email', email)}
          aria-expanded={isDesktop ? open === 'email' : undefined}
        >
          {email}
        </a>
        {isDesktop && open === 'email' && (
          <div className="biz-pop">
            <p role="status">{copied === 'email' ? 'כתובת המייל הועתקה' : email}</p>
            <div className="biz-pop-actions">
              <a href={gmailUrl} target="_blank" rel="noopener noreferrer">פתיחה ב-Gmail</a>
              <a href={outlookUrl} target="_blank" rel="noopener noreferrer">פתיחה ב-Outlook</a>
              <a href={`mailto:${email}?subject=${subject}`}>תוכנת המייל במחשב</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
