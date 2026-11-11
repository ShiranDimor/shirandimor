import Link from 'next/link';

// משפט אי-המלצה קצר וקבוע, לשימוש ליד הצגת עסקאות/מחירים בפועל (לא רק בפוטר הגלובלי
// שבתחתית העמוד - שם קל לפספס בעמוד ארוך עם הרבה כרטיסי עסקה). שירן ביקשה מפורשות
// שעדיף כפילות על פני מקום שחסר בו, מטעמים משפטיים - ר' SiteDisclaimer.tsx לנוסח המלא בפוטר
export default function TradeDisclaimer() {
  return (
    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
      המידע להמחשה ולמידה בלבד ואינו מהווה ייעוץ השקעות או המלצה לביצוע עסקה -{' '}
      <Link href="/terms" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>תנאי שימוש</Link>
    </p>
  );
}
