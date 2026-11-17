// הופך כתובות URL בתוך טקסט חופשי (כמו תשובות של דור) לקישורים שאפשר ללחוץ עליהם -
// גם בנייד וגם בדסקטופ. בלי זה קישור שדור שולחת מוצג כטקסט רגיל שאי אפשר ללחוץ עליו.
// כולל גם כתובות שנכתבו בלי https:// בהתחלה (כמו "shirandimor.com/?join=1"), שדור נוטה
// לפעמים לכתוב בצורה קצרה יותר בלי הפרוטוקול - אחרת הן לא היו מזוהות בכלל.
const URL_PATTERN = /((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|co\.il|net|io|link)(?:\/[^\s]*)?)/gi;

function toHref(part: string): string {
  return /^https?:\/\//i.test(part) ? part : `https://${part}`;
}

export default function Linkify({ text }: { text: string }) {
  // ה-regex כולל קבוצת לכידה, ולכן split מחזיר את הכתובות עצמן כאיברים באינדקסים אי-זוגיים
  // בתוך המערך - זה מונע להסתמך על test() על regex גלובלי (עם state פנימי שמשתנה בין קריאות)
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={toHref(part)} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
