'use client';

// כפתור לפתיחת הזימון האמיתי ביומן Google - לא יצירת עותק נפרד. כך כל שינוי מועד או ביטול מתעדכנים אוטומטית
// גם ביומן של שירן וגם ביומן של מי שקבע/ה (דרך הזימון שנשלח למייל). עותק ידני (קישור "הוספה" או קובץ ics)
// לא היה מתעדכן, ולכן אין כאן כפתור כזה.
export default function AddToCalendar({ eventLink }: { eventLink?: string }) {
  return (
    <>
      <p className="mt-cal-note">הזימון נשלח למייל שלך - לחיצה על &quot;כן&quot; בזימון מוסיפה אותו ליומן (Google, אייפון או אאוטלוק), וכל שינוי מועד או ביטול יתעדכנו בו לבד.</p>
      {eventLink && (
        <div className="mt-cal-actions">
          <a className="mt-cal-btn" href={eventLink} target="_blank" rel="noopener noreferrer">
            פתיחת הזימון ביומן Google
          </a>
        </div>
      )}
    </>
  );
}
