'use client';

import { usePathname } from 'next/navigation';

// מוסתר בעמוד בוט התמיכה הפנימי - הוא צמוד מדי לכפתור "שליחה" של הצ'אט וגורם ללחיצות בטעות,
// ובכל מקרה מיותר שם (זה כלי בדיקה פנימי, לא עמוד תמיכה למנויים)
export default function WhatsAppFloatButton() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin/support-bot')) return null;

  return (
    <a href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer" className="wa-float-btn">
      <img src="/whatsapp-icon.svg" alt="וואטסאפ" width="26" height="26" />
    </a>
  );
}
