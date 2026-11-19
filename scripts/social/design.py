"""מערכת העיצוב של התוכן לאינסטגרם/פייסבוק של שירן (v3: נייר/דיו, כותרות סריף, ורוד אחד).

שימוש: from design import *  -> frame(), story(), head(), para(), mark(), n(), big(), row()
פוסט פיד 1080x1350, סטורי 1080x1920. כללים קשיחים:
- מספרים תמיד בתוך n() (span LTR, בלי שבירת שורה)
- לא להשתמש בתו החץ (נרנדר כריבוע בשרת) - אם צריך חץ, SVG
- ₪ רק דרך SH (הפונט הסריפי מצייר אותו כמו ש)
- לא לסיים משפט במספר צמוד לנקודה
- גוף ראשון בלבד, בקול של שירן
"""
import json, os, sys


PAPER, INK, MUTE_P, MUTE_D, RULE_P, RULE_D, PINK = '#F3EFE8', '#1A181C', '#6E6870', '#9A949C', '#D9D2C7', '#3A353D', '#FF2D78'
SERIF = "'Frank Ruhl Libre', serif"
SANS = "'Rubik', sans-serif"
FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Rubik:wght@400;500;600&display=swap'
F, S = 1350, 1920


def base_css(h, bg, fg):
    return (f"*{{box-sizing:border-box;margin:0;padding:0}}html,body{{width:1080px;height:{h}px;overflow:hidden;background:{bg}}}"
            f"body{{color:{fg};font-family:{SANS};direction:rtl;-webkit-font-smoothing:antialiased}}"
            f".serif{{font-family:{SERIF};font-weight:900;letter-spacing:-0.01em}}"
            f".meta{{font-size:24px;font-weight:500;letter-spacing:.06em}}"
            f".num{{font-feature-settings:'tnum' 1}}")


def doc(body, h=F, dark=False, extra_css=''):
    bg, fg = (INK, PAPER) if dark else (PAPER, INK)
    return (f'<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
            f'<link href="{FONTS}" rel="stylesheet"><style>{base_css(h, bg, fg)}{extra_css}</style></head>'
            f'<body>{body}</body></html>')


def frame(inner, h=F, dark=False, kicker='', page='', foot_left='', zoom=1.0):
    """Editorial frame: masthead rule on top, content, byline rule at the bottom."""
    mute = MUTE_D if dark else MUTE_P
    rule = RULE_D if dark else RULE_P
    fg = PAPER if dark else INK
    kick = (f'<span style="display:flex;align-items:center;gap:14px"><span style="width:14px;height:14px;background:{PINK};display:inline-block"></span>'
            f'<span class="meta" style="color:{fg}">{kicker}</span></span>') if kicker else '<span></span>'
    top = (f'<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:22px;border-bottom:2px solid {fg}">'
           f'{kick}<span class="meta num" dir="ltr" style="color:{mute}">{page}</span></div>')
    bottom = (f'<div style="display:flex;justify-content:space-between;align-items:center;padding-top:22px;border-top:1px solid {rule}">'
              f'<span class="meta" style="color:{fg}">שירן דימור <span style="color:{mute};font-weight:400">· מסחר אחראי במניות</span></span>'
              f'<span class="meta" style="color:{mute}">{foot_left}</span></div>')
    # stories: keep clear of Instagram's top bar and reply field, and scale the type up for the tall format
    pad = '230px 88px 250px' if h == S else '84px 88px'
    body = (f'<div style="width:{904/zoom:.0f}px;zoom:{zoom}">{inner}</div>' if zoom != 1.0 else inner)
    return doc(f'<div style="width:1080px;height:{h}px;padding:{pad};display:flex;flex-direction:column;justify-content:space-between">'
               f'{top}<div style="flex:1;display:flex;flex-direction:column;justify-content:center">{body}</div>{bottom}</div>', h, dark)


def head(text, size=120, color=None, mt=0, lh=1.04, maxw=900):
    c = f'color:{color};' if color else ''
    return f'<h1 class="serif" style="font-size:{size}px;line-height:{lh};{c}margin-top:{mt}px;max-width:{maxw}px">{text}</h1>'


def para(text, size=44, color=None, mt=40, weight=400, maxw=860, lh=1.45):
    c = f'color:{color};' if color else ''
    return f'<p style="font-size:{size}px;font-weight:{weight};line-height:{lh};{c}margin-top:{mt}px;max-width:{maxw}px">{text}</p>'


def mark(word):
    """Single accent: a pink underline under one word, nothing else."""
    return f'<span style="background:linear-gradient(transparent 82%, {PINK} 82%, {PINK} 94%, transparent 94%)">{word}</span>'




SH = '<span style="font-family:Rubik;font-weight:500">₪</span>'


def n(t):
    return f'<span class="num" dir="ltr" style="white-space:nowrap">{t}</span>'


def big(i, color=PINK):
    return f'<div class="serif num" style="font-size:240px;line-height:.8;color:{color};font-weight:700">{i}</div>'


def row(t, s, tw=290):
    return (f'<div style="display:flex;gap:28px;align-items:baseline;padding:22px 0;border-bottom:1px solid {RULE_P}">'
            f'<span class="serif" style="font-size:50px;font-weight:700;min-width:{tw}px">{t}</span>'
            f'<span style="font-size:38px;color:{INK};line-height:1.4">{s}</span></div>')


def story(inner, dark=False, kicker='', foot=''):
    return frame(inner, S, dark, kicker, '', foot, zoom=1.12)


CTA_END = '\n\nכנסו ללינק 👇🏿\nShirandimor.com'
