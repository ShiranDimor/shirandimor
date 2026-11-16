import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import { getAgreement, readLink } from '@/lib/agreements';
import type { Terms } from '@/lib/agreements/types';
import AgreementView from './AgreementView';
import '../../mentoring/mentoring.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'אישור הסכם | שירן דימור',
  robots: { index: false, follow: false },
};

// עמוד חתימה דיגיטלית על הסכם: /agreement/<id> (הסכם לכולם) או /agreement/<id>?t=<קישור אישי>
export default function AgreementPage({ params, searchParams }: { params: { id: string }; searchParams: { t?: string } }) {
  const agreement = getAgreement(params.id);

  let problem = '';
  let terms: Terms = {};
  if (!agreement || !agreement.active) {
    problem = 'ההסכם הזה לא זמין כרגע לחתימה.';
  } else if (agreement.termFields.length > 0) {
    const link = readLink(agreement.id, searchParams.t || '');
    if (!link) problem = 'הקישור לא תקין. אפשר לבקש משירן קישור חדש.';
    else if (link.expired) problem = 'הקישור פג תוקף. אפשר לבקש משירן קישור חדש.';
    else terms = link.terms;
  }

  // הנוסח המלא לכל אפשרות בחירה (מסלול) - מוצג לפי מה שהתלמיד/ה בוחר/ת, בלי לטעון מחדש
  const blocksByOption: Record<string, ReturnType<NonNullable<typeof agreement>['blocks']>> = {};
  if (agreement && !problem) {
    if (agreement.variant) for (const o of agreement.variant.options) blocksByOption[o.value] = agreement.blocks({ ...terms, [agreement.variant.key]: o.value });
    else blocksByOption._ = agreement.blocks(terms);
  }

  return (
    <div className="wrap mt-page">
      <SiteHeader />
      {problem || !agreement ? (
        <section className="mt-section mt-fitcall" style={{ marginTop: 8 }}>
          <h2 className="mt-h2">אישור <em>הסכם</em></h2>
          <p className="mt-lead">{problem}</p>
          <a className="mt-inline-link" href="https://wa.me/972547167419" target="_blank" rel="noopener noreferrer">לכתוב לשירן בוואטסאפ ←</a>
        </section>
      ) : (
        <>
          <section className="mt-section" style={{ marginTop: 8 }}>
            <h1 className="mt-h2">{agreement.title}</h1>
            <p className="mt-lead">{agreement.intro}</p>
          </section>
          <AgreementView
            agreementId={agreement.id}
            token={searchParams.t || ''}
            defaultName={terms.studentName || ''}
            variant={agreement.variant || null}
            blocksByOption={blocksByOption}
            choices={agreement.signerChoices || []}
          />
        </>
      )}
    </div>
  );
}
