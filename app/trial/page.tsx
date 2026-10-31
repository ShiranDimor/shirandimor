'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// עמוד "7 ימי ניסיון" הידני (השארת שם+נייד, שירן חוזרת בעצמה) הוחלף לגמרי במסלול כרטיס
// אשראי אוטומטי ב-/subscribe (חודש ראשון מלא ב-₪1, ואז ₪400/חודש) - השער היחיד מעכשיו.
// נשאר כהפניה כדי שקישורים ישנים (פוסטים, הודעות פוש שכבר נשלחו, בוט) ימשיכו לעבוד
export default function TrialSignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/subscribe');
  }, [router]);

  return null;
}
