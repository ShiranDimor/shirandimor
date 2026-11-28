// מייל "ברוכים הבאים" למנוי/ה חדש/ה בהטבת ₪1 - נשלח מיד אחרי התשלום (Grow webhook), במקביל
// למייל הכניסה. הנוסח אושר ע"י שירן ב-28.11.2026: לשון יחיד שנקראת גם בזכר וגם בנקבה (בלי
// פעלים מגדריים), בלי לבבות. הוואטסאפ: שירן מצרפת ידנית לקבוצת "מדברים עסקאות" - לא נשלח כלום
// מהוואטסאפ שלה ואין כאן קישור לוואטסאפ.

const SITE = 'https://www.shirandimor.com';
const LESSON = `${SITE}/lessons/ebcaa892-63af-4f7a-ae56-4e08347ad6a1`;

function html(firstName: string) {
  const p = (t: string) => `<p style="font-size:15px;color:#F2EFF1;line-height:1.75;margin:0 0 14px;">${t}</p>`;
  const h = (t: string) => `<div style="font-size:16px;color:#FFB648;font-weight:700;margin:22px 0 8px;">${t}</div>`;
  const li = (t: string) => `<li style="font-size:14.5px;color:#E6E1E8;line-height:1.7;margin-bottom:6px;">${t}</li>`;
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="color-scheme" content="light only" /></head><body style="margin:0;padding:0;">
  <div dir="rtl" style="font-family: Arial, Helvetica, sans-serif; background:#121013; padding:24px 12px;">
    <div style="max-width:600px;margin:0 auto;background:#211F23;border-radius:14px;overflow:hidden;border:1px solid #332E35;">
      <div style="background:#17151A;padding:24px;text-align:center;">
        <img src="${SITE}/shiran-photo.jpg" width="60" height="60" alt="שירן דימור" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid #FF2D78;margin-bottom:12px;" />
        <div style="color:#fff;font-size:19px;font-weight:700;">ברוכים הבאים ל"מדברים עסקאות"</div>
        <div style="color:#B8B2B9;font-size:13.5px;margin-top:6px;">מסחר <span style="color:#FF2D78;">אחראי</span> במניות</div>
      </div>
      <div style="padding:26px 24px;">
        ${p(`היי${firstName ? ` ${firstName}` : ''},`)}
        ${p('איזה כיף שהצטרפת ל"מדברים עסקאות" 🙂')}
        ${p('כדי לא לפספס אף עסקה, הדבר הראשון והחשוב ביותר הוא להדליק את העדכונים באתר. זה לוקח שתי דקות:')}
        ${h('1. כניסה לאתר')}
        ${p(`במקביל למייל הזה נשלח אליך מייל נוסף עם קישור כניסה. אפשר גם להיכנס ישירות ל-<a href="${SITE}/login" style="color:#FF7AA8;">shirandimor.com</a> ← "כניסה", עם כתובת המייל שאיתה נרשמת.`)}
        ${h('2. הדלקת העדכונים בפעמון')}
        ${p('לוחצים על הפעמון 🔔 למעלה, ואז "הפעלת עדכונים", ומאשרים את ההתראות.')}
        <ul style="margin:0 0 6px;padding-right:20px;">
          ${li('באנדרואיד ובמחשב זה עובד מיד.')}
          ${li('באייפון צריך קודם להוסיף את האתר למסך הבית: בספארי לוחצים על כפתור השיתוף ← "הוספה למסך הבית". אחר כך פותחים את האתר מהאייקון החדש ומדליקים את העדכונים.')}
        </ul>
        <a href="${SITE}/login" style="display:block;text-align:center;background:linear-gradient(90deg,#FF2D78,#FFB648);color:#1A181C;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin:18px 0 6px;">כניסה לאתר והדלקת עדכונים ←</a>
        ${h('מה מגיע מהיום')}
        <ul style="margin:0 0 6px;padding-right:20px;">
          ${li('<b>באתר:</b> כל עסקה שלי בזמן אמת, עם מחיר כניסה, סטופ, עד איזה מחיר עוד אפשר להיכנס, והסבר למה. וגם עדכון כשעסקה נסגרת, כולל ההפסדים.')}
          ${li('<b>בקבוצת הוואטסאפ "מדברים עסקאות":</b> אני אצרף אותך בקרוב. שם יש עדכונים, תזכורות ללייבים והודעות שוטפות.')}
          ${li('לייבים שבועיים וספריית שיעורים, הכל באתר.')}
        </ul>
        ${h('מאיפה הכי נכון להתחיל?')}
        ${p(`מהשיעור <a href="${LESSON}" style="color:#FF7AA8;">"אז איך תכלס מתחילים לסחור?"</a> בספריית השיעורים. ואם משהו לא ברור, אפשר לשאול את דור, העוזרת החכמה באתר, בכל שעה. או פשוט לכתוב לי.`)}
        ${p('בהצלחה, ושמחה שהצטרפת,<br>שירן')}
      </div>
    </div>
  </div></body></html>`;
}

function text(firstName: string) {
  return `היי${firstName ? ` ${firstName}` : ''},

איזה כיף שהצטרפת ל"מדברים עסקאות" 🙂

כדי לא לפספס אף עסקה, הדבר הראשון והחשוב ביותר הוא להדליק את העדכונים באתר. זה לוקח שתי דקות:

1. כניסה לאתר
במקביל למייל הזה נשלח אליך מייל נוסף עם קישור כניסה. אפשר גם להיכנס ישירות ל-${SITE}/login עם כתובת המייל שאיתה נרשמת.

2. הדלקת העדכונים בפעמון
לוחצים על הפעמון 🔔 למעלה, ואז "הפעלת עדכונים", ומאשרים את ההתראות.
- באנדרואיד ובמחשב זה עובד מיד.
- באייפון צריך קודם להוסיף את האתר למסך הבית: בספארי לוחצים על כפתור השיתוף ← "הוספה למסך הבית". אחר כך פותחים את האתר מהאייקון החדש ומדליקים את העדכונים.

מה מגיע מהיום
- באתר: כל עסקה שלי בזמן אמת, עם מחיר כניסה, סטופ, עד איזה מחיר עוד אפשר להיכנס, והסבר למה. וגם עדכון כשעסקה נסגרת, כולל ההפסדים.
- בקבוצת הוואטסאפ "מדברים עסקאות": אני אצרף אותך בקרוב. שם יש עדכונים, תזכורות ללייבים והודעות שוטפות.
- לייבים שבועיים וספריית שיעורים, הכל באתר.

מאיפה הכי נכון להתחיל?
מהשיעור "אז איך תכלס מתחילים לסחור?" בספריית השיעורים: ${LESSON}
ואם משהו לא ברור, אפשר לשאול את דור, העוזרת החכמה באתר, בכל שעה. או פשוט לכתוב לי.

בהצלחה, ושמחה שהצטרפת,
שירן`;
}

export async function sendWelcomeEmail(to: string, fullName: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to || !to.includes('@')) return false;
  const firstName = (fullName || '').trim().split(' ')[0] || '';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: 'שירן דימור - מסחר אחראי במניות <noreply@shirandimor.com>',
      to,
      subject: 'ברוכים הבאים ל"מדברים עסקאות" – ככה מתחילים',
      html: html(firstName),
      text: text(firstName),
    }),
  });
  if (!res.ok) console.error('welcome email failed', to, await res.text());
  return res.ok;
}
