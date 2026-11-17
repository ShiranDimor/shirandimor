// הסכם/תנאי שימוש למנויי "מדברים עסקאות" - טיוטה. שירן תוסיף את הנוסח בהמשך:
// ממלאים את blocks, מעלים version, ומשנים active ל-true. אין תנאים אישיים - קישור אחד קבוע לכל המנויים:
// shirandimor.com/agreement/subscribers
import type { AgreementTemplate } from './types';

export const subscribersAgreement: AgreementTemplate = {
  id: 'subscribers',
  title: 'הסכם מנוי - מדברים עסקאות',
  version: 'draft',
  active: false,
  intro: 'זה ההסכם למנויי "מדברים עסקאות". כדאי לעבור עליו בנחת - ובסוף למלא פרטים, לאשר ולחתום.',
  termFields: [],
  blocks: () => [
    { h: 'הנוסח יתווסף בקרוב', p: ['ההסכם למנויים עדיין בהכנה.'] },
  ],
};
