'use client';

// שלב קרב בזירה (בסגנון בראול סטארס): הפוקימון השותף זז עם ג'ויסטיק ויורה על פוקימונים פראיים.
// האנגלית היא מה שנותן כוח:
//  - קופסת הפתעה 🎁 - שוברים אותה, אומרים את המילה באנגלית ומקבלים קוביית כוח (יותר נזק ויותר חיים)
//  - סופר - נטען מפגיעות; כדי להפעיל אותו אומרים משפט באנגלית
//  - אחרי שאוספים 8 יהלומים, את הבוס מזמנים רק עם משפט באנגלית (חובה - נשארים עד שמצליחים)
// בסוף - הבוס (הפוקימון של השלב) נחלש, ועוברים למשחק הזריקה כדי לתפוס אותו.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MOVES, POKEMON, PRAISE, sentenceFor, spriteUrl, type Word, type World } from './data';
import { pickWord, type Progress } from './progress';
import { canListen, en, he, heardWord, listenOnce, speakLines, stopSpeaking, type Line } from './speech';
import s from './game.module.css';

const AW = 960; // גודל הזירה ביחידות לוגיות (מוקטן/מוגדל לרוחב המסך)
const AH = 640;
const GEMS_NEEDED = 8;
const PLAYER_R = 26;
const PLAYER_SPEED = 200;
const SHOT_SPEED = 560;
const SHOT_RANGE = 460;
const MAX_AMMO = 3;
const RELOAD = 0.85;
const HITS_FOR_SUPER = 6;
const SUPER_RADIUS = 300;
// פוקימונים "שומרים" שמסתובבים בזירה (רק תמונה - לא נתפסים)
const MINIONS = [19, 41, 74, 92, 100, 109];

interface Rect { x: number; y: number; w: number; h: number }
interface Mob {
  id: number; x: number; y: number; r: number; hp: number; max: number; speed: number;
  boss: boolean; cd: number; tx: number; ty: number; flash: number; face: number;
}
interface Shot { x: number; y: number; vx: number; vy: number; life: number; mine: boolean; dmg: number; r: number }
interface Box { x: number; y: number; hp: number; flash: number }
interface Gem { x: number; y: number }
interface Fx { x: number; y: number; text: string; t: number; color?: string; size: number; vy: number; em?: boolean }
interface Card {
  kind: 'box' | 'super' | 'summon';
  word: Word;
  en: string;
  he: string;
  match: string;
  fails: number;
}

const LAYOUTS: { walls: Rect[]; bushes: Rect[] }[] = [
  {
    walls: [
      { x: 190, y: 150, w: 150, h: 44 }, { x: 620, y: 150, w: 150, h: 44 },
      { x: 190, y: 446, w: 150, h: 44 }, { x: 620, y: 446, w: 150, h: 44 },
      { x: 450, y: 280, w: 60, h: 80 },
    ],
    bushes: [{ x: 60, y: 270, w: 110, h: 100 }, { x: 790, y: 270, w: 110, h: 100 }, { x: 410, y: 50, w: 140, h: 60 }],
  },
  {
    walls: [
      { x: 300, y: 120, w: 44, h: 160 }, { x: 616, y: 120, w: 44, h: 160 },
      { x: 300, y: 380, w: 360, h: 44 },
    ],
    bushes: [{ x: 120, y: 120, w: 110, h: 110 }, { x: 730, y: 120, w: 110, h: 110 }, { x: 420, y: 200, w: 120, h: 90 }],
  },
  {
    walls: [
      { x: 140, y: 300, w: 200, h: 44 }, { x: 620, y: 300, w: 200, h: 44 },
      { x: 458, y: 100, w: 44, h: 140 },
    ],
    bushes: [{ x: 380, y: 360, w: 200, h: 80 }, { x: 60, y: 60, w: 120, h: 100 }, { x: 780, y: 60, w: 120, h: 100 }],
  },
];

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const inRect = (p: { x: number; y: number }, r: Rect, pad = 0) =>
  p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;

// דוחף עיגול החוצה מקיר מלבני (ומגבולות הזירה)
function collide(o: { x: number; y: number }, r: number, walls: Rect[]) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(o.x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(o.y, w.y + w.h));
    const dx = o.x - cx;
    const dy = o.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < r) {
      if (d === 0) { o.y = w.y - r; continue; }
      o.x = cx + (dx / d) * r;
      o.y = cy + (dy / d) * r;
    }
  }
  o.x = Math.max(r, Math.min(AW - r, o.x));
  o.y = Math.max(r, Math.min(AH - r, o.y));
}

// ---------- צלילים קטנים (בלי קבצים) ----------
let audio: AudioContext | null = null;
function sfx(freqs: number[], dur = 0.08, type: OscillatorType = 'sine', vol = 0.06) {
  try {
    if (!audio) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio = new Ctor();
    }
    const t0 = audio.currentTime;
    freqs.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, t0 + i * dur);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (i + 1) * dur);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + i * dur);
      o.stop(t0 + (i + 1) * dur);
    });
  } catch {}
}
const SND = {
  shoot: () => sfx([700, 500], 0.05, 'square', 0.03),
  hit: () => sfx([300], 0.06, 'triangle', 0.05),
  ouch: () => sfx([200, 130], 0.1, 'sawtooth', 0.04),
  gem: () => sfx([988, 1319], 0.06, 'triangle', 0.05),
  power: () => sfx([523, 659, 784, 1046], 0.09, 'triangle', 0.07),
  super: () => sfx([196, 262, 392, 523, 784], 0.07, 'sawtooth', 0.06),
  box: () => sfx([400, 600, 900], 0.06, 'square', 0.04),
};

interface Props {
  world: World;
  worldIndex: number;
  stage: number;
  partner: number;
  wild: number;
  heb: boolean;
  progress: () => Progress;
  showHints: boolean;
  onWord: (word: string, ok: boolean) => void;
  onStar: () => void;
  onTutorialDone: () => void;
  onFinish: () => void;
  onExit: () => void;
}

export default function Brawl(props: Props) {
  const { world, worldIndex, stage, partner, wild, heb } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  const [card, setCard] = useState<Card | null>(null);
  const [bubble, setBubble] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hud, setHud] = useState({ gems: 0, phase: 'wave', bossHp: 1, power: 0, charge: 0, ammo: MAX_AMMO });
  const [knob, setKnob] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const [hints, setHints] = useState(props.showHints);

  const layout = LAYOUTS[stage % LAYOUTS.length];
  const G = useRef({
    phase: 'wave' as 'wave' | 'summon' | 'boss' | 'won',
    paused: false,
    p: { x: AW / 2, y: AH - 60, hp: 100, max: 100, face: 1, inv: 0, dead: 0, ammo: MAX_AMMO, reload: 0, power: 0, inBush: false },
    joy: { x: 0, y: 0 },
    keys: new Set<string>(),
    mobs: [] as Mob[],
    shots: [] as Shot[],
    gems: [] as Gem[],
    boxes: [] as Box[],
    fx: [] as Fx[],
    blast: null as null | { x: number; y: number; t: number },
    shake: 0,
    gemCount: 0,
    hits: 0,
    spawnT: 0.5,
    recent: [] as string[],
    moved: false,
    shot: false,
    tutDone: !props.showHints,
  });

  const talk = useCallback(async (lines: Line[]) => {
    setBubble(lines);
    await speakLines(lines);
  }, []);

  const floatText = (x: number, y: number, text: string, color = '#fff', size = 22) => {
    G.current.fx.push({ x, y, text, t: 1, color, size, vy: -50 });
  };

  // ---------- כרטיס דיבור (המשחק עוצר בזמן שהוא פתוח) ----------
  const openCard = useCallback((kind: Card['kind']) => {
    const g = G.current;
    g.paused = true;
    g.joy = { x: 0, y: 0 };
    setKnob(null);
    const { word, world: source } = pickWord(cb.current.progress(), world, g.recent);
    g.recent = [...g.recent.slice(-3), word.en];
    const partnerName = POKEMON[partner] ?? { name: 'Pikachu', he: "פיקאצ'ו" };
    let c: Card;
    if (kind === 'box') {
      c = { kind, word, en: word.en, he: word.he, match: word.en, fails: 0 };
      talk(heb
        ? [he(`קופסת הפתעה! זה ${word.he}. באנגלית אומרים:`), en(word.en), he('תלחצי על המיקרופון ותגידי - ותקבלי כוח!')]
        : [en(`A surprise box! Say: ${word.en}!`)]);
    } else {
      const sent = sentenceFor(source, word, partnerName);
      c = { kind, word, en: sent.en, he: sent.he, match: sent.match, fails: 0 };
      const intro = kind === 'super'
        ? `סופר מוכן! כדי להפעיל אותו, תגידי באנגלית: ${sent.he}`
        : `אספת את כל היהלומים! כדי לקרוא לבוס ${POKEMON[wild]?.he ?? ''}, תגידי באנגלית: ${sent.he}`;
      talk(heb
        ? [he(intro), en(sent.en), he('תלחצי על המיקרופון ותגידי!')]
        : [en(kind === 'super' ? `Super ready! Say: ${sent.en}` : `Call the boss! Say: ${sent.en}`)]);
    }
    setCard(c);
  }, [heb, partner, talk, wild, world]);

  const closeCard = useCallback(() => {
    setCard(null);
    setBusy(false);
    G.current.paused = false;
  }, []);

  const spawnBoss = useCallback(() => {
    const g = G.current;
    const hp = 24 + stage * 6 + worldIndex * 3;
    g.mobs.push({
      id: wild, x: AW / 2, y: 90, r: 46, hp, max: hp, speed: 55 + worldIndex * 4,
      boss: true, cd: 2.5, tx: AW / 2, ty: 200, flash: 0, face: 1,
    });
    g.phase = 'boss';
    g.shake = 0.5;
    floatText(AW / 2, 60, 'BOSS!', '#ffcb05', 40);
  }, [stage, wild, worldIndex]);

  const doSuper = useCallback(() => {
    const g = G.current;
    g.hits = 0;
    g.blast = { x: g.p.x, y: g.p.y, t: 0 };
    g.shake = 0.6;
    SND.super();
    for (const m of g.mobs) {
      if (dist(m, g.p) < SUPER_RADIUS + m.r) {
        const dmg = m.boss ? 6 : 99;
        m.hp -= dmg;
        m.flash = 0.3;
        const d = dist(m, g.p) || 1;
        m.x += ((m.x - g.p.x) / d) * 60;
        m.y += ((m.y - g.p.y) / d) * 60;
        floatText(m.x, m.y - m.r, `-${dmg}`, '#ffeb3b', 30);
      }
    }
    for (const b of g.boxes) if (dist(b, g.p) < SUPER_RADIUS) b.hp = 0;
  }, []);

  const success = useCallback(async (c: Card) => {
    const g = G.current;
    cb.current.onWord(c.word.en, true);
    closeCard();
    if (c.kind === 'box') {
      g.p.power += 1;
      g.p.max += 20;
      g.p.hp = g.p.max;
      SND.power();
      floatText(g.p.x, g.p.y - 50, '⚡ POWER UP!', '#ffeb3b', 28);
      talk(heb ? [en(rand(PRAISE)), he('קיבלת קוביית כוח! עכשיו את חזקה יותר!')] : [en(`${rand(PRAISE)} Power up!`)]);
    } else if (c.kind === 'super') {
      doSuper();
      const move = MOVES[partner];
      talk([en(`${rand(PRAISE)} ${POKEMON[partner]?.name ?? ''}, super ${move?.en ?? 'attack'}!`)]);
    } else {
      spawnBoss();
      talk(heb
        ? [en(`Here comes ${POKEMON[wild]?.name ?? 'the boss'}!`), he('הבוס הגיע! תירי עליו עד שהוא נחלש!')]
        : [en(`Here comes ${POKEMON[wild]?.name ?? 'the boss'}! Attack!`)]);
    }
  }, [closeCard, doSuper, heb, partner, spawnBoss, talk, wild]);

  const onMic = useCallback(async () => {
    if (!card || busy || listening) return;
    setListening(true);
    setBubble([heb ? he('אני מקשיב... 👂') : en('I am listening... 👂')]);
    const heard = await listenOnce(8000);
    setListening(false);
    const { word } = card;
    const ok = heardWord(heard, card.match) || (word.accept ?? []).some((a) => heardWord(heard, card.match.replace(word.en, a)));
    if (ok) return success(card);
    if (card.fails === 0) cb.current.onWord(word.en, false);
    setCard({ ...card, fails: card.fails + 1 });
    setBusy(true);
    await talk(heb
      ? [he(heard.length ? 'כמעט! תקשיבי שוב ונסי:' : 'לא שמעתי. תלחצי על המיקרופון ותגידי:'), en(card.en)]
      : [en(heard.length ? `Almost! Say it again: ${card.en}` : `I didn't hear you. Say: ${card.en}`)]);
    setBusy(false);
  }, [busy, card, heb, listening, success, talk]);

  const attack = useCallback(() => {
    const g = G.current;
    const pl = g.p;
    if (g.paused || pl.dead > 0 || g.phase === 'won' || pl.ammo < 1) return;
    pl.ammo -= 1;
    g.shot = true;
    // כיוון אוטומטי: האויב/הקופסה הכי קרובים; אחרת - לכיוון ההליכה
    const targets: { x: number; y: number }[] = [...g.mobs, ...g.boxes];
    let best: { x: number; y: number } | null = null;
    let bd = SHOT_RANGE;
    for (const t of targets) {
      const d = dist(t, pl);
      if (d < bd) { bd = d; best = t; }
    }
    let ang: number;
    if (best) ang = Math.atan2(best.y - pl.y, best.x - pl.x);
    else if (g.joy.x || g.joy.y) ang = Math.atan2(g.joy.y, g.joy.x);
    else ang = -Math.PI / 2;
    if (Math.cos(ang) !== 0) pl.face = Math.cos(ang) > 0 ? 1 : -1;
    g.shots.push({
      x: pl.x, y: pl.y, vx: Math.cos(ang) * SHOT_SPEED, vy: Math.sin(ang) * SHOT_SPEED,
      life: SHOT_RANGE / SHOT_SPEED, mine: true, dmg: 1 + pl.power * 0.5, r: 14,
    });
    SND.shoot();
  }, []);

  const pressSuper = useCallback(() => {
    const g = G.current;
    if (g.paused || g.phase === 'won') return;
    if (g.hits >= HITS_FOR_SUPER) openCard('super');
    else speakLines(cb.current.heb ? [he('הסופר עוד לא מוכן. תפגעי עוד באויבים כדי לטעון אותו!')] : [en('Hit more enemies to charge your super!')]);
  }, [openCard]);

  // ---------- לולאת המשחק ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const imgs = new Map<number, HTMLImageElement>();
    const img = (id: number) => {
      let i = imgs.get(id);
      if (!i) { i = new Image(); i.src = spriteUrl(id); imgs.set(id, i); }
      return i;
    };
    [partner, wild, ...MINIONS].forEach(img);

    let scale = 1;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrapRef.current?.clientWidth || 800;
      scale = W / AW;
      const H = AH * scale;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const g = G.current;
    // קופסאות הפתעה: 2 בכל שלב, במקומות פתוחים
    const boxSpots = [{ x: 120, y: 520 }, { x: 840, y: 520 }, { x: 480, y: 200 }, { x: 120, y: 80 }, { x: 840, y: 80 }];
    for (const b of boxSpots) {
      if (g.boxes.length >= 2) break;
      if (!layout.walls.some((w) => inRect(b, w, 30)) && Math.random() < 0.7) g.boxes.push({ ...b, hp: 3, flash: 0 });
    }
    if (g.boxes.length === 0) g.boxes.push({ x: 120, y: 520, hp: 3, flash: 0 });

    const emoji = (e: string, x: number, y: number, size: number) => {
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e, x, y);
    };
    const bar = (x: number, y: number, w: number, frac: number, color: string) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 10);
      ctx.fillStyle = color;
      ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 6);
    };
    const sprite = (id: number, x: number, y: number, size: number, face: number, alpha = 1, flash = 0) => {
      ctx.save();
      ctx.globalAlpha = 0.25 * alpha;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.42, size * 0.35, size * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      const im = img(id);
      ctx.translate(x, y);
      ctx.scale(face, 1);
      if (flash > 0) ctx.filter = 'brightness(2.5)';
      if (im.complete && im.naturalWidth) ctx.drawImage(im, -size / 2, -size / 2, size, size);
      else emoji('❓', 0, 0, size * 0.6);
      ctx.restore();
    };

    const spawnMinion = () => {
      for (let tries = 0; tries < 10; tries++) {
        const pt = { x: 60 + Math.random() * (AW - 120), y: 50 + Math.random() * 200 };
        if (dist(pt, g.p) < 300 || layout.walls.some((w) => inRect(pt, w, 30))) continue;
        const hp = 3 + Math.floor(stage / 2);
        g.mobs.push({
          id: rand(MINIONS), x: pt.x, y: pt.y, r: 24, hp, max: hp,
          speed: 70 + stage * 8 + worldIndex * 4, boss: false, cd: 2 + Math.random() * 2,
          tx: pt.x, ty: pt.y, flash: 0, face: 1,
        });
        return;
      }
    };

    const hurtPlayer = (dmg: number) => {
      const pl = g.p;
      if (pl.inv > 0 || pl.dead > 0) return;
      pl.hp -= dmg;
      pl.inv = 0.7;
      g.shake = 0.25;
      SND.ouch();
      floatText(pl.x, pl.y - 40, `-${dmg}`, '#ff5252', 24);
      if (pl.hp <= 0) {
        pl.hp = 0;
        pl.dead = 2.2;
        if (g.phase === 'wave') {
          const lost = Math.min(2, g.gemCount);
          g.gemCount -= lost;
          for (let i = 0; i < lost; i++) g.gems.push({ x: pl.x + (i ? 30 : -30), y: pl.y });
        }
        speakLines(cb.current.heb ? [he('אוי! נפלת. עוד רגע חוזרים לקרב!')] : [en('Oh no! Back in a moment!')]);
      }
    };

    let last = performance.now();
    let raf = 0;
    let hudT = 0;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pl = g.p;

      if (!g.paused && g.phase !== 'won') {
        // תנועה: ג'ויסטיק או מקלדת
        let jx = g.joy.x;
        let jy = g.joy.y;
        if (g.keys.size) {
          jx = (g.keys.has('ArrowRight') || g.keys.has('d') ? 1 : 0) - (g.keys.has('ArrowLeft') || g.keys.has('a') ? 1 : 0);
          jy = (g.keys.has('ArrowDown') || g.keys.has('s') ? 1 : 0) - (g.keys.has('ArrowUp') || g.keys.has('w') ? 1 : 0);
          const l = Math.hypot(jx, jy) || 1;
          jx /= l; jy /= l;
        }
        if (pl.dead > 0) {
          pl.dead -= dt;
          if (pl.dead <= 0) { pl.hp = pl.max; pl.x = AW / 2; pl.y = AH - 60; pl.inv = 1.5; }
        } else {
          pl.x += jx * PLAYER_SPEED * dt;
          pl.y += jy * PLAYER_SPEED * dt;
          if (jx) { pl.face = jx > 0 ? 1 : -1; g.moved = true; }
          if (jy) g.moved = true;
          collide(pl, PLAYER_R, layout.walls);
        }
        pl.inv = Math.max(0, pl.inv - dt);
        pl.inBush = layout.bushes.some((b) => inRect(pl, b));
        if (pl.ammo < MAX_AMMO) {
          pl.reload += dt;
          if (pl.reload >= RELOAD) { pl.ammo += 1; pl.reload = 0; }
        }
        if (g.moved && g.shot && !g.tutDone) {
          g.tutDone = true;
          cb.current.onTutorialDone();
        }

        // יצירת אויבים
        g.spawnT -= dt;
        const minions = g.mobs.filter((m) => !m.boss).length;
        const maxMinions = g.phase === 'wave' ? 3 + Math.min(2, stage) : g.phase === 'boss' ? 2 : 0;
        if (g.spawnT <= 0 && minions < maxMinions) {
          spawnMinion();
          g.spawnT = 2.2;
        }

        // אויבים
        for (const m of g.mobs) {
          m.flash = Math.max(0, m.flash - dt);
          const seen = pl.dead <= 0 && !pl.inBush && dist(m, pl) < (m.boss ? 700 : 320);
          if (seen) { m.tx = pl.x; m.ty = pl.y; }
          else if (dist(m, { x: m.tx, y: m.ty }) < 20) {
            m.tx = 60 + Math.random() * (AW - 120);
            m.ty = 50 + Math.random() * (AH - 100);
          }
          const d = dist(m, { x: m.tx, y: m.ty }) || 1;
          const keep = seen && m.boss ? 160 : 0; // הבוס שומר מרחק ויורה
          if (d > keep) {
            m.x += ((m.tx - m.x) / d) * m.speed * dt;
            m.y += ((m.ty - m.y) / d) * m.speed * dt;
            if (Math.abs(m.tx - m.x) > 2) m.face = m.tx > m.x ? 1 : -1;
          }
          collide(m, m.r, layout.walls);
          if (pl.dead <= 0 && dist(m, pl) < m.r + PLAYER_R) hurtPlayer(m.boss ? 15 : 10);
          m.cd -= dt;
          if (seen && m.cd <= 0) {
            const a = Math.atan2(pl.y - m.y, pl.x - m.x);
            const angles = m.boss ? [-0.4, -0.2, 0, 0.2, 0.4] : [0];
            for (const da of angles) {
              g.shots.push({ x: m.x, y: m.y, vx: Math.cos(a + da) * 210, vy: Math.sin(a + da) * 210, life: 2.4, mine: false, dmg: m.boss ? 10 : 8, r: 10 });
            }
            m.cd = m.boss ? 2 : 2.6 + Math.random() * 1.5 - stage * 0.2;
          }
        }

        // יריות
        for (const sh of g.shots) {
          sh.x += sh.vx * dt;
          sh.y += sh.vy * dt;
          sh.life -= dt;
          if (layout.walls.some((w) => inRect(sh, w))) sh.life = 0;
          if (sh.life <= 0) continue;
          if (sh.mine) {
            for (const m of g.mobs) {
              if (dist(sh, m) < m.r + sh.r) {
                m.hp -= sh.dmg;
                m.flash = 0.15;
                sh.life = 0;
                g.hits = Math.min(HITS_FOR_SUPER, g.hits + 1);
                SND.hit();
                floatText(m.x, m.y - m.r, `-${Math.round(sh.dmg * 10) / 10}`, '#fff', 20);
                break;
              }
            }
            for (const b of g.boxes) {
              if (sh.life > 0 && dist(sh, b) < 30) {
                b.hp -= 1;
                b.flash = 0.15;
                sh.life = 0;
                SND.box();
              }
            }
          } else if (pl.dead <= 0 && dist(sh, pl) < PLAYER_R + sh.r) {
            sh.life = 0;
            hurtPlayer(sh.dmg);
          }
        }
        g.shots = g.shots.filter((sh) => sh.life > 0);

        // אויבים שנפלו
        for (const m of g.mobs) {
          if (m.hp > 0) continue;
          for (let i = 0; i < 6; i++) g.fx.push({ x: m.x, y: m.y, text: '✨', t: 0.8, size: 22, vy: -40 - Math.random() * 60, em: true });
          if (m.boss) {
            g.phase = 'won';
            g.shake = 0.6;
            SND.power();
            speakLines(cb.current.heb
              ? [en(`${POKEMON[wild]?.name ?? ''} is weak!`), he('ניצחת! עכשיו זורקים עליו כדור פוקימון!')]
              : [en(`You won! ${POKEMON[wild]?.name ?? ''} is weak! Let's catch it!`)]);
            setTimeout(() => cb.current.onFinish(), 2400);
          } else if (g.phase === 'wave') {
            g.gems.push({ x: m.x, y: m.y });
          }
        }
        g.mobs = g.mobs.filter((m) => m.hp > 0);

        // קופסאות שנשברו -> כרטיס מילה
        for (const b of g.boxes) {
          if (b.hp <= 0) {
            for (let i = 0; i < 5; i++) g.fx.push({ x: b.x, y: b.y, text: '⭐', t: 0.8, size: 20, vy: -60 - Math.random() * 40, em: true });
            setTimeout(() => openCard('box'), 250);
          }
        }
        g.boxes = g.boxes.filter((b) => b.hp > 0);

        // איסוף יהלומים
        for (const gm of g.gems) {
          if (pl.dead <= 0 && dist(gm, pl) < 42) {
            gm.x = -999;
            g.gemCount += 1;
            SND.gem();
            cb.current.onStar();
            floatText(pl.x, pl.y - 40, '💎+1', '#80deea', 22);
          }
        }
        g.gems = g.gems.filter((gm) => gm.x > -999);
        if (g.phase === 'wave' && g.gemCount >= GEMS_NEEDED) {
          g.phase = 'summon';
          g.mobs = g.mobs.filter((m) => m.boss);
          g.shots = [];
          setTimeout(() => openCard('summon'), 300);
        }
      }

      g.shake = Math.max(0, g.shake - dt);
      for (const f of g.fx) { f.t -= dt; f.y += f.vy * dt; }
      g.fx = g.fx.filter((f) => f.t > 0);
      if (g.blast) { g.blast.t += dt; if (g.blast.t > 0.6) g.blast = null; }

      // ---------- ציור ----------
      ctx.save();
      if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 12 * g.shake, (Math.random() - 0.5) * 12 * g.shake);
      ctx.fillStyle = '#f6edd6';
      ctx.fillRect(0, 0, AW, AH);
      ctx.fillStyle = 'rgba(0,0,0,0.035)';
      for (let x = 0; x < AW; x += 64) for (let y = 0; y < AH; y += 64) if (((x + y) / 64) % 2 === 0) ctx.fillRect(x, y, 64, 64);
      ctx.strokeStyle = world.color;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, AW - 10, AH - 10);
      for (const w of layout.walls) {
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = '#a1887f';
        ctx.fillRect(w.x, w.y, w.w, 10);
      }
      for (const gm of g.gems) emoji('💎', gm.x, gm.y + Math.sin(now / 200 + gm.x) * 4, 28);
      for (const b of g.boxes) {
        emoji('🎁', b.x, b.y, b.flash > 0 ? 50 : 44);
        b.flash = Math.max(0, b.flash - dt);
      }
      for (const m of g.mobs) {
        const size = m.r * 2.6;
        sprite(m.id, m.x, m.y, size, m.face, 1, m.flash);
        bar(m.x, m.y - size / 2 - 6, m.boss ? 90 : 46, m.hp / m.max, m.boss ? '#ff7043' : '#ef5350');
        if (m.boss) emoji('👑', m.x, m.y - size / 2 - 22, 26);
      }
      if (pl.dead <= 0) {
        const blink = pl.inv > 0 && Math.floor(now / 80) % 2 === 0;
        sprite(partner, pl.x, pl.y, 76, -pl.face, pl.inBush ? 0.45 : blink ? 0.4 : 1);
        bar(pl.x, pl.y - 52, 56, pl.hp / pl.max, '#66bb6a');
        for (let i = 0; i < MAX_AMMO; i++) {
          ctx.fillStyle = i < pl.ammo ? '#ffa726' : 'rgba(0,0,0,0.25)';
          ctx.fillRect(pl.x - 27 + i * 19, pl.y + 40, 16, 6);
        }
      } else {
        emoji('💫', pl.x, pl.y, 40);
      }
      for (const b of layout.bushes) {
        ctx.fillStyle = 'rgba(76,175,80,0.55)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        for (let x = b.x + 20; x < b.x + b.w; x += 36) for (let y = b.y + 20; y < b.y + b.h; y += 34) emoji('🌿', x, y, 30);
      }
      const move = MOVES[partner];
      for (const sh of g.shots) {
        if (sh.mine) emoji(move?.fx ?? '⚡', sh.x, sh.y, 28);
        else {
          ctx.fillStyle = '#8e24aa';
          ctx.beginPath();
          ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (g.blast) {
        const r = SUPER_RADIUS * Math.min(1, g.blast.t / 0.35);
        ctx.globalAlpha = 1 - g.blast.t / 0.6;
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.arc(g.blast.x, g.blast.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const f of g.fx) {
        ctx.globalAlpha = Math.min(1, f.t * 2);
        if (f.em) emoji(f.text, f.x, f.y, f.size);
        else {
          ctx.font = `bold ${f.size}px Rubik, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#333';
          ctx.strokeText(f.text, f.x, f.y);
          ctx.fillStyle = f.color ?? '#fff';
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      hudT -= dt;
      if (hudT <= 0) {
        hudT = 0.1;
        const boss = g.mobs.find((m) => m.boss);
        setHud((h) => {
          const next = {
            gems: g.gemCount, phase: g.phase, bossHp: boss ? boss.hp / boss.max : g.phase === 'won' ? 0 : 1,
            power: pl.power, charge: g.hits / HITS_FOR_SUPER, ammo: pl.ammo,
          };
          return JSON.stringify(next) === JSON.stringify(h) ? h : next;
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const keyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); attack(); return; }
      if (e.key === 'e') { pressSuper(); return; }
      if (e.key.startsWith('Arrow') || 'wasd'.includes(e.key)) { e.preventDefault(); g.keys.add(e.key); }
    };
    const keyUp = (e: KeyboardEvent) => g.keys.delete(e.key);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    talk(heb
      ? [en("Let's battle!"), he(`אספי ${GEMS_NEEDED} יהלומים מהפוקימונים הפראיים. מזיזים עם האצבע בצד שמאל, ויורים עם הכפתור האדום!`)]
      : [en(`Let's battle! Collect ${GEMS_NEEDED} gems!`)]);
    const t = setTimeout(() => setHints(false), 9000);
    return () => { clearTimeout(t); stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ג'ויסטיק צף: איפה שהאצבע נוגעת בצד שמאל - שם המרכז
  const joyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    setKnob({ ox: e.clientX - r.left, oy: e.clientY - r.top, dx: 0, dy: 0 });
  };
  const joyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!knob) return;
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - r.left - knob.ox;
    let dy = e.clientY - r.top - knob.oy;
    const l = Math.hypot(dx, dy);
    const max = 55;
    if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
    setKnob({ ...knob, dx, dy });
    G.current.joy = l > 8 ? { x: dx / max, y: dy / max } : { x: 0, y: 0 };
  };
  const joyUp = () => {
    setKnob(null);
    G.current.joy = { x: 0, y: 0 };
  };

  const micSupported = canListen();
  const superReady = hud.charge >= 1;

  return (
    <div className={s.root} style={{ ['--world' as string]: world.color }}>
      <div className={s.battleTop}>
        <button className={s.iconBtn} onClick={() => { stopSpeaking(); props.onExit(); }} aria-label="map">🗺️</button>
        {hud.phase === 'wave' || hud.phase === 'summon' ? (
          <div className={s.gemBar}>
            <span>💎 {Math.min(hud.gems, GEMS_NEEDED)}/{GEMS_NEEDED}</span>
            <div className={s.gemTrack} dir="ltr"><div style={{ width: `${(Math.min(hud.gems, GEMS_NEEDED) / GEMS_NEEDED) * 100}%` }} /></div>
          </div>
        ) : (
          <div className={s.gemBar}>
            <span>👑 {POKEMON[wild]?.he}</span>
            <div className={`${s.gemTrack} ${s.bossTrack}`} dir="ltr"><div style={{ width: `${hud.bossHp * 100}%` }} /></div>
          </div>
        )}
        <span className={s.stars}>⚡ {hud.power}</span>
      </div>

      <div ref={wrapRef} className={s.arenaWrap} dir="ltr">
        <canvas ref={canvasRef} className={s.runCanvas} />
        {!card && (
          <>
            <div className={s.joyZone} onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp}>
              {knob ? (
                <div className={s.joyBase} style={{ left: knob.ox, top: knob.oy }}>
                  <div className={s.joyKnob} style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
                </div>
              ) : hints ? (
                <div className={s.joyHint}>👆 גוררים כאן כדי לזוז</div>
              ) : null}
            </div>
            <button
              className={`${s.superBtn} ${superReady ? s.superReady : ''}`}
              style={{ ['--charge' as string]: `${Math.round(hud.charge * 360)}deg` }}
              onPointerDown={(e) => { e.preventDefault(); pressSuper(); }}
            >
              <span>{superReady ? '💥' : '🔒'}</span>
            </button>
            <button className={s.fireBtn} onPointerDown={(e) => { e.preventDefault(); attack(); }}>
              {MOVES[partner]?.fx ?? '⚡'}
              {hints && <span className={s.fireHint}>יורים!</span>}
            </button>
          </>
        )}
        {card && (
          <div className={s.cardOverlay} dir="rtl">
            <div className={s.speakCard}>
              {card.kind !== 'summon' && <button className={s.cardClose} onClick={() => { stopSpeaking(); closeCard(); }} aria-label="close">✖</button>}
              <div className={s.cardTitle}>
                {card.kind === 'box' ? '🎁 קופסת הפתעה' : card.kind === 'super' ? '💥 סופר!' : `👑 קוראים לבוס`}
              </div>
              <div className={s.bigPic}>{card.word.pic}</div>
              <div className={s.bubble} onClick={() => talk([he(card.he), en(card.en)])}>
                {bubble.map((l, i) => (
                  <div key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'} className={l.lang === 'he' ? s.bubbleHe : undefined}>
                    {l.text}
                  </div>
                ))}
                <span className={s.replay}>🔊</span>
              </div>
              {micSupported && (
                <button className={`${s.mic} ${listening ? s.micOn : ''}`} onClick={onMic} disabled={busy}>🎤</button>
              )}
              <div className={s.helpRow}>
                <button className={s.smallBtn} onClick={() => talk([en(card.en)])}>🔊 שוב</button>
                <button className={s.smallBtn} onClick={() => talk([he(card.he), en(card.en)])}>🇮🇱 עזרה</button>
                {/* בלי זיהוי דיבור, או אחרי 3 ניסיונות (לפעמים המיקרופון פשוט לא קולט מבטא) - אמא יכולה לאשר */}
                {(!micSupported || card.fails >= 3) && (
                  <button className={s.smallBtn} onClick={() => success(card)}>👩 אמא שמעה</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={s.bubbleLine}>
        {!card && bubble.map((l, i) => (
          <span key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'}>{l.text} </span>
        ))}
      </div>
    </div>
  );
}
