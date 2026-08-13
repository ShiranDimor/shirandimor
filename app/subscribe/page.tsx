'use client';

import Link from 'next/link';

export default function SubscribePage() {
  return (
    <div className="wrap">
      <header>
        <div className="brand">מסחר <span>אחראי</span> במניות</div>
        <Link href="/" className="nav-link">← חזרה</Link>
      </header>

      <div className="form-title">
        הצטרפות לקבוצת הסוחרים <span style={{ fontSize: '14px', color: 'var(--text-tertiary)', fontWeight: 400 }}>"מדברים עסקאות"</span>
      </div>
      <div className="form-sub">מנוי חודשי · ללא התחייבות</div>

      <div className="price-card">
        <div style={{ display: 'inline-block', background: 'rgba(79,174,126,0.12)', color: 'var(--profit)', fontSize: '11.5px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', marginBottom: '14px' }}>
          חודש ראשון ב-50% הנחה
        </div>
        <div className="amount">₪200<span>/חודש ראשון</span></div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px', textDecoration: 'line-through' }}>₪400 לחודש</div>
        <div className="period">לאחר מכן ₪400/חודש · ללא התחייבות וללא תקופת מינימום</div>

        <div className="perk-list">
          <div>מסחר תוך-יומי לייב - כניסות ויציאות בזמן אמת</div>
          <div>מסחר סווינג - עסקאות Short Squeeze עם הנימוק המלא</div>
          <div>השקעות לטווח ארוך - בניית תיק שיטתית, לא "טיפים"</div>
          <div>ליווי אישי לצד קהילה סגורה לדיון מעמיק</div>
          <div>יומן מסחר שקוף - כולל עסקאות מפסידות</div>
          <div>תיק מסחר אישי וניתוח העסקאות ע"י שירן</div>
        </div>

        <a href="https://pay.grow.link/200a7cdcb258ee6ffdea0f423a1ace0e-MzE4MDU5OA" target="_blank" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          מעבר לדף התשלום המאובטח ←
        </a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '10px' }}>
          <span style={{ fontSize: '10px' }}>🔒</span>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>תשלום מאובטח ע"י Grow</span>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
        אפשר לבטל בכל רגע נתון. בלי קנס ובלי שאלות. לאחר התשלום, החשבון עובר לאישור ידני ותקבלי גישה תוך זמן קצר.
      </p>

      <footer>מסחר בשוק ההון כרוך בסיכון. אין באמור המלצה לפעולה כלשהי.</footer>
    </div>
  );
}
