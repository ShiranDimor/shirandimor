import type { Metadata } from 'next';
import { Suspense } from 'react';
import SiteHeader from '@/components/SiteHeader';
import ManageCall from './ManageCall';
import '../mentoring.css';

export const metadata: Metadata = {
  title: 'שינוי או ביטול שיחת התאמה | שירן דימור',
  robots: { index: false, follow: false },
};

// עמוד אישי (נגיש רק עם הקישור החתום מהזימון / ממסך האישור) לשינוי מועד או ביטול של שיחת ההתאמה
export default function ManageCallPage() {
  return (
    <div className="wrap mt-page">
      <SiteHeader current="/mentoring" />
      <section className="mt-section mt-fitcall" style={{ marginTop: 8 }}>
        <h2 className="mt-h2">שיחת ההתאמה <em>שלך</em></h2>
        <Suspense fallback={<p className="mt-form-note">רגע...</p>}>
          <ManageCall />
        </Suspense>
      </section>
    </div>
  );
}
