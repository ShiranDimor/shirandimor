import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import { getAgreement, readLink } from '@/lib/agreements';
import type { Terms } from '@/lib/agreements/types';
import SignForm from './SignForm';
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

  const blocks = agreement && !problem ? agreement.blocks(terms) : [];

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
            <div className="ag-doc">
              {blocks.map((b) => (
                <div key={b.h} className="ag-block">
                  <h2>{b.h}</h2>
                  {b.p?.map((x) => <p key={x}>{x}</p>)}
                  {b.table && (
                    <table className="ag-table">
                      <tbody>{b.table.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
                    </table>
                  )}
                  {b.ul && <ul>{b.ul.map((x) => <li key={x}>{x}</li>)}</ul>}
                  {b.ol && <ol>{b.ol.map((x) => <li key={x}>{x}</li>)}</ol>}
                </div>
              ))}
            </div>
          </section>
          <section className="mt-section mt-fitcall" id="sign">
            <h2 className="mt-h2">פרטים, אישור <em>וחתימה</em></h2>
            <p className="mt-lead">אחרי החתימה יישלח אלייך במייל עותק חתום של ההסכם, ועותק גם לשירן.</p>
            <SignForm agreementId={agreement.id} token={searchParams.t || ''} defaultName={terms.studentName || ''} choices={agreement.signerChoices || []} />
          </section>
        </>
      )}
    </div>
  );
}
