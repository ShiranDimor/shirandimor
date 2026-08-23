const GREEN_INVOICE_BASE_URL =
  process.env.GREEN_INVOICE_ENV === 'sandbox'
    ? 'https://sandbox.d.greeninvoice.co.il/api/v1'
    : 'https://api.greeninvoice.co.il/api/v1';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const res = await fetch(`${GREEN_INVOICE_BASE_URL}/account/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: process.env.GREEN_INVOICE_API_KEY,
      secret: process.env.GREEN_INVOICE_API_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Green Invoice auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = { token: data.token, expiresAt: Date.now() + 25 * 60_000 };
  return cachedToken.token;
}

// יוצר ושולח חשבונית ללקוח בחשבונית ירוקה. קוד סוג המסמך (320 = חשבונית מס קבלה) ואופן
// השליחה האוטומטית במייל טרם אומתו מול תיעוד חי (הגישה לתיעוד חסומה מהסביבה הזו) -
// יש לבדוק מסמך אחד בסביבת sandbox לפני הפעלה בפרודקשן ולעדכן GREEN_INVOICE_DOC_TYPE בהתאם
export async function createSubscriptionInvoice({
  name,
  email,
  phone,
  amount,
  description,
}: {
  name: string;
  email: string;
  phone?: string;
  amount: number;
  description: string;
}) {
  const token = await getToken();

  const res = await fetch(`${GREEN_INVOICE_BASE_URL}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: Number(process.env.GREEN_INVOICE_DOC_TYPE || 320),
      lang: 'he',
      currency: 'ILS',
      vatType: 0,
      client: {
        name,
        emails: [email],
        phone: phone || undefined,
        add: true,
      },
      income: [
        {
          description,
          quantity: 1,
          price: amount,
          currency: 'ILS',
          vatType: 0,
        },
      ],
      emailContent: {
        to: email,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Green Invoice document creation failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
