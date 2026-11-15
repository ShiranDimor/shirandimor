'use client';

import { usePathname } from 'next/navigation';

export default function WhatsAppFloatButton() {
  const pathname = usePathname();
  // בעמוד לארגונים יש פס צף משלו (כולל וואטסאפ) - לא מציגים שם את הכפתור הכללי כדי לא להעמיס
  if (pathname?.startsWith('/business')) return null;
  // המשחק של דור - עמוד פרטי לילדה, בלי כפתורים צפים של האתר
  if (pathname?.startsWith('/dor-english')) return null;
  // עמודי ניהול - כפתור צף (position: fixed) חוסם פיזית כפתורי פעולה בתוך רשימות ארוכות שגוללות
  // מתחתיו (למשל "תזמון שליחה" בלוח המודעות), ובלאו הכי אין טעם ב"לכתוב לי בוואטסאפ" לשירן
  // עצמה. DorChatWidget כבר מוחרג כאן - זה היה הכפתור הצף היחיד שעדיין לא
  if (pathname?.startsWith('/admin')) return null;

  return (
    <a href="https://wa.me/972529115377" target="_blank" rel="noopener noreferrer" className="wa-float-btn">
      <img src="/whatsapp-icon.svg" alt="וואטסאפ" width="26" height="26" />
    </a>
  );
}
