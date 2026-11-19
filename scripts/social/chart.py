"""גרף נרות בעיצוב של שירן, כ-SVG שנכנס ישר לתוך slides_html (בלי קבצי תמונה).

הנתונים: JSON של Yahoo chart API. מהקונטיינר אין גישה לרשת, אז מושכים דרך Supabase:
  select net.http_get('https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=2y&interval=1wk');
  -- ובשאילתה נפרדת: select content from net._http_response where id=<id>;
שומרים את ה-content לקובץ ומעבירים אותו ל-candles_svg().

שירן סוחרת סווינג בעיקר על גרף שבועי/חודשי - ברירת המחדל היא שבועי.
"""
import json
from datetime import datetime, timezone

from design import INK, PINK, MUTE_P, RULE_P, PAPER, SANS


def load_yahoo(path):
    r = json.load(open(path))['chart']['result'][0]
    q = r['indicators']['quote'][0]
    rows = []
    for t, o, h, l, c in zip(r['timestamp'], q['open'], q['high'], q['low'], q['close']):
        if None in (o, h, l, c):
            continue
        rows.append(dict(t=datetime.fromtimestamp(t, timezone.utc), o=o, h=h, l=l, c=c))
    return r['meta'], rows


def candles_svg(rows, w=904, h=560, levels=(), last=None, dark=False):
    """levels: [(price, 'תווית'), ...] - קווים אופקיים מקווקווים (תמיכה/התנגדות).
    last: כמה נרות אחרונים להציג (None = הכול)."""
    if last:
        rows = rows[-last:]
    fg = PAPER if dark else INK
    grid = '#3A353D' if dark else RULE_P
    lo = min(min(r['l'] for r in rows), *(p for p, _ in levels)) if levels else min(r['l'] for r in rows)
    hi = max(max(r['h'] for r in rows), *(p for p, _ in levels)) if levels else max(r['h'] for r in rows)
    pad = (hi - lo) * 0.06
    lo, hi = lo - pad, hi + pad
    axis_w = 110
    pw = w - axis_w
    m = 22  # שוליים למעלה/למטה כדי שהמחירים בציר לא ייחתכו
    y = lambda p: m + (hi - p) / (hi - lo) * (h - 2 * m)
    step = pw / len(rows)
    bw = max(2.0, step * 0.62)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="display:block;direction:ltr">']
    # 4 grid lines with prices on the right
    for i in range(5):
        p = lo + (hi - lo) * i / 4
        yy = y(p)
        out.append(f'<line x1="0" x2="{pw}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{grid}" stroke-width="1"/>')
        out.append(f'<text x="{pw + 12}" y="{yy + 9:.1f}" font-family="Rubik" font-size="26" fill="{MUTE_P}">{p:,.0f}</text>')
    for i, r in enumerate(rows):
        cx = i * step + step / 2
        up = r['c'] >= r['o']
        col = fg if up else PINK
        out.append(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{y(r["h"]):.1f}" y2="{y(r["l"]):.1f}" stroke="{col}" stroke-width="2"/>')
        top, bot = y(max(r['o'], r['c'])), y(min(r['o'], r['c']))
        fill = 'none' if up else PINK
        out.append(f'<rect x="{cx - bw / 2:.1f}" y="{top:.1f}" width="{bw:.1f}" height="{max(1.5, bot - top):.1f}" fill="{fill}" stroke="{col}" stroke-width="2"/>')
    for p, label in levels:
        yy = y(p)
        out.append(f'<line x1="0" x2="{pw}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{PINK}" stroke-width="3" stroke-dasharray="12 8"/>')
        bg = INK if dark else PAPER
        out.append(f'<text x="6" y="{yy - 12:.1f}" text-anchor="start" font-family="Rubik" font-weight="600" font-size="26" fill="{PINK}" '
                   f'stroke="{bg}" stroke-width="8" paint-order="stroke">{label} {p:,.0f}</text>')
    out.append('</svg>')
    return ''.join(out)
