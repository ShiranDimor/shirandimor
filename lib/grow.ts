export type GrowPayment = {
  phone: string | null;
  email: string | null;
  fullName: string | null;
  amount: number | null;
  transactionId: string | null;
  webhookKey: string | null;
};

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

// Grow לא חושף תיעוד ציבורי מלא לשדות ה-webhook - השמות למטה מבוססים על התיעוד החלקי שכן נמצא
// (webhookKey, paymentSum, fullName, payerPhone/payerEmail וכו') ולכן בודקים כמה חלופות סבירות
// לכל שדה. כדאי לבדוק בלוגים של הקריאה האמיתית הראשונה מ-Grow שהשדות אכן נתפסים נכון, ולעדכן כאן
// אם צריך.
export function parseGrowPayload(raw: Record<string, unknown>): GrowPayment {
  const phone = firstString(raw, ['phone', 'payerPhone', 'cellphone', 'tel', 'client_phone']);
  const email = firstString(raw, ['email', 'payerEmail', 'mail', 'client_email']);
  const fullName = firstString(raw, ['fullName', 'full_name', 'name', 'payerName', 'client_name']);
  const amountRaw = firstString(raw, ['paymentSum', 'sum', 'amount', 'price', 'total', 'payment_sum']);
  const transactionId = firstString(raw, ['transactionCode', 'transactionId', 'asmachta', 'paymentCode', 'transaction_id']);
  const webhookKey = firstString(raw, ['webhookKey', 'webhook_key', 'secret', 'key']);

  return {
    phone,
    email,
    fullName,
    amount: amountRaw ? Number(amountRaw) : null,
    transactionId,
    webhookKey,
  };
}
