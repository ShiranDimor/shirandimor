'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'cookie_consent_v1';

// באנר הסכמה לעוגיות/תנאי שימוש - מוצג פעם אחת למבקר/ת חדש/ה (עד שמאשרים), נשאר קבוע עד
// לאישור. לא חוסם גלישה (אין overlay על כל המסך) - רק מופיע בתחתית עד שלוחצים "הבנתי"
export default function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch (e) {
      // אחסון חסום - פשוט לא מציגים את הבאנר, עדיף מאשר להציג אותו שוב בכל טעינה בלי אפשרות לזכור אישור
    }
  }, []);

  function accept() {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch (e) {
      // ראה הערה למעלה
    }
  }

  if (!visible) return null;
  if (pathname?.startsWith('/dor-english')) return null;

  return (
    <div className="cookie-banner">
      <p>
        האתר משתמש בעוגיות ואמצעים דומים לצורך תפעולו ושיפור החוויה. המשך הגלישה מהווה הסכמה, כמפורט ב
        <a href="/privacy">מדיניות הפרטיות</a> ו
        <a href="/terms">תקנון השימוש</a>.
      </p>
      <button type="button" className="btn-primary" onClick={accept}>הבנתי</button>
    </div>
  );
}
