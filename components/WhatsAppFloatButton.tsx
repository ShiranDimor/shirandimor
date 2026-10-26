'use client';

import { usePathname } from 'next/navigation';

export default function WhatsAppFloatButton() {
  const pathname = usePathname();
  // בעמוד לארגונים יש פס צף משלו (כולל וואטסאפ) - לא מציגים שם את הכפתור הכללי כדי לא להעמיס
  if (pathname?.startsWith('/business')) return null;

  return (
    <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer" className="wa-float-btn">
      <img src="/whatsapp-icon.svg" alt="וואטסאפ" width="26" height="26" />
    </a>
  );
}
