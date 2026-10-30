'use client';

// שלב ריצה: הפוקימון השותף רץ במסלול. קופצים מעל אבנים, מתכופפים מתחת לציפורים ואוספים כוכבים.
// בכל שער צריך להגיד משפט באנגלית - רק כשאומרים אותו נכון השער נפתח וממשיכים לרוץ.
// בסוף המסלול מחכה הפוקימון הפראי של השלב.

import { useCallback, useEffect, useRef, useState } from 'react';
import { POKEMON, PRAISE, sentenceFor, spriteUrl, type Word, type World } from './data';
import { pickWord, type Progress } from './progress';
import { canListen, en, he, heardWord, listenOnce, speakLines, stopSpeaking, type Line } from './speech';
import s from './game.module.css';

type EntType = 'rock' | 'bird' | 'star' | 'gate' | 'finish';
interface Ent {
  type: EntType;
  x: number; // מיקום במסלול (פיקסלים מתחילת השלב)
  h?: number; // לכוכבים: גובה מעל הקרקע
  done?: boolean;
}
interface Gate {
  ent: Ent;
  word: Word;
  sent: { en: string; he: string; match: string };
  fails: number;
}

const H = 340;
const GROUND = H - 46;
const PLAYER_X = 90;
const PLAYER_H = 70; // גובה "הגוף" לבדיקת התנגשות; מתכופפים = 38
const GRAVITY = 1500;
const JUMP_V = 820;
const DUCK_MS = 900;
const ROCK_HALF = 18;
const BIRD_LOW = 55; // הציפור עפה בגובה הראש: בין 55 ל-95 מעל הקרקע
const BIRD_HIGH = 95;

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// ---------- צלילים קטנים (בלי קבצים) ----------
let audio: AudioContext | null = null;
function sfx(freqs: number[], dur = 0.09, type: OscillatorType = 'sine', vol = 0.07) {
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
  jump: () => sfx([440, 660], 0.08),
  star: () => sfx([880, 1320], 0.06, 'triangle', 0.05),
  hit: () => sfx([180, 120], 0.12, 'square', 0.05),
  gate: () => sfx([523, 659, 784, 1046], 0.1, 'triangle', 0.07),
};

function buildTrack(stage: number, worldIndex: number): { ents: Ent[]; len: number } {
  const len = 3600 + stage * 700;
  const gatesAt = [0.28, 0.56, 0.84].map((f) => Math.round(len * f));
  const ents: Ent[] = [];
  let x = 650;
  let i = 0;
  while (x < len - 300) {
    if (gatesAt.some((g) => Math.abs(g - x) < 280)) {
      x += 160;
      continue;
    }
    // שני המכשולים הראשונים קבועים (אבן ואז ציפור) - בשביל ההדרכה ובשביל התחלה רגועה
    const type: EntType = i === 0 ? 'rock' : i === 1 ? 'bird' : Math.random() < 0.6 ? 'rock' : 'bird';
    ents.push({ type, x });
    // כוכבים: מעל אבן (קופצים ואוספים) או אחרי ציפור (על הקרקע)
    if (type === 'rock') ents.push({ type: 'star', x, h: 150 });
    else ents.push({ type: 'star', x: x + 170, h: 25 });
    x += Math.max(330, 420 + Math.random() * 220 - stage * 30 - worldIndex * 10);
    i++;
  }
  gatesAt.forEach((g) => ents.push({ type: 'gate', x: g }));
  ents.push({ type: 'finish', x: len });
  ents.sort((a, b) => a.x - b.x);
  return { ents, len };
}

interface Props {
  world: World;
  worldIndex: number;
  stage: number;
  partner: number;
  wild: number;
  heb: boolean;
  progress: () => Progress;
  showTutorial: boolean;
  onWord: (word: string, ok: boolean) => void;
  onStar: () => void;
  onTutorialDone: () => void;
  onFinish: () => void;
  onExit: () => void;
}

export default function Runner(props: Props) {
  const { world, worldIndex, stage, partner, wild, heb } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const cb = useRef(props);
  cb.current = props;

  const [gate, setGate] = useState<Gate | null>(null);
  const [tut, setTut] = useState<'jump' | 'duck' | null>(null);
  const [runStars, setRunStars] = useState(0);
  const [pct, setPct] = useState(0);
  const [bubble, setBubble] = useState<Line[]>([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);

  const G = useRef({
    ...buildTrack(stage, worldIndex),
    dist: 0,
    speed: 210 + stage * 25 + worldIndex * 8,
    y: 0,
    vy: 0,
    duckUntil: 0,
    hitUntil: 0,
    mode: 'run' as 'run' | 'gate' | 'tutorial' | 'done',
    tutStep: props.showTutorial ? 0 : 2,
    recent: [] as string[],
  });

  const talk = useCallback(async (lines: Line[]) => {
    setBubble(lines);
    await speakLines(lines);
  }, []);

  const openGate = useCallback((ent: Ent) => {
    const g = G.current;
    const { word, world: source } = pickWord(cb.current.progress(), world, g.recent);
    g.recent = [...g.recent.slice(-3), word.en];
    const sent = sentenceFor(source, word, POKEMON[partner] ?? { name: 'Pikachu', he: "פיקאצ'ו" });
    setGate({ ent, word, sent, fails: 0 });
    talk(heb
      ? [he(`שער! כדי לפתוח אותו, תגידי באנגלית: ${sent.he}`), en(sent.en), he('תלחצי על המיקרופון ותגידי.')]
      : [en(`A gate! Say: ${sent.en}`)]);
  }, [heb, partner, talk, world]);

  const passGate = useCallback(async () => {
    if (!gate) return;
    SND.gate();
    gate.ent.done = true;
    setGate(null);
    setBusy(false);
    G.current.mode = 'run';
    talk(heb ? [en(rand(PRAISE)), he('השער נפתח! ממשיכים לרוץ!')] : [en(`${rand(PRAISE)} The gate is open!`)]);
  }, [gate, heb, talk]);

  const onMic = useCallback(async () => {
    if (!gate || busy || listening) return;
    setListening(true);
    setBubble([heb ? he('אני מקשיב... 👂') : en('I am listening... 👂')]);
    const heard = await listenOnce(8000);
    setListening(false);
    const { word, sent } = gate;
    const ok = heardWord(heard, sent.match) || (word.accept ?? []).some((a) => heardWord(heard, sent.match.replace(word.en, a)));
    if (ok) {
      cb.current.onWord(word.en, true);
      return passGate();
    }
    // נשארים בשער עד שמצליחים. נרשם כטעות רק פעם אחת לכל שער (בשביל מסך ההורים)
    if (gate.fails === 0) cb.current.onWord(word.en, false);
    setGate({ ...gate, fails: gate.fails + 1 });
    setBusy(true);
    await talk(heb
      ? [he(heard.length ? 'כמעט! תקשיבי שוב ונסי:' : 'לא שמעתי. תלחצי על המיקרופון ותגידי:'), en(sent.en)]
      : [en(heard.length ? `Almost! Say it again: ${sent.en}` : `I didn't hear you. Say: ${sent.en}`)]);
    setBusy(false);
  }, [busy, gate, heb, listening, passGate, talk]);

  const jump = useCallback(() => {
    const g = G.current;
    if (g.mode === 'tutorial' && g.tutStep === 0) {
      g.mode = 'run';
      g.tutStep = 1;
      setTut(null);
      stopSpeaking();
    }
    if (g.mode !== 'run' || g.y > 0) return;
    g.vy = JUMP_V;
    g.y = 0.1;
    SND.jump();
  }, []);

  const duck = useCallback(() => {
    const g = G.current;
    if (g.mode === 'tutorial' && g.tutStep === 1) {
      g.mode = 'run';
      g.tutStep = 2;
      setTut(null);
      stopSpeaking();
      cb.current.onTutorialDone();
    }
    if (g.mode !== 'run') return;
    g.duckUntil = performance.now() + DUCK_MS;
    if (g.y > 0) g.vy = Math.min(g.vy, -700); // באוויר - נוחתים מהר
  }, []);

  // ---------- לולאת המשחק ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const imgs = { partner: new Image(), wild: new Image() };
    imgs.partner.src = spriteUrl(partner);
    imgs.wild.src = spriteUrl(wild);
    let W = 600;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = wrapRef.current?.clientWidth || 600;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const emoji = (e: string, x: number, bottom: number, size: number) => {
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(e, x, bottom);
    };

    let last = performance.now();
    let raf = 0;
    let lastPct = -1;

    const step = (now: number) => {
      const g = G.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (g.mode === 'run') {
        const hurt = now < g.hitUntil;
        g.dist += (hurt ? 30 : g.speed) * dt;
        if (g.y > 0 || g.vy > 0) {
          g.vy -= GRAVITY * dt;
          g.y = Math.max(0, g.y + g.vy * dt);
          if (g.y === 0) g.vy = 0;
        }
        const ducking = now < g.duckUntil && g.y === 0;
        const top = g.y + (ducking ? 38 : PLAYER_H);
        for (const e of g.ents) {
          const d = e.x - g.dist; // מרחק מהשחקן
          if (d > W) break;
          if (e.done) continue;
          if (e.type === 'rock') {
            if (Math.abs(d) < ROCK_HALF + 22 && g.y < 40 && !hurt) {
              e.done = true;
              g.hitUntil = now + 600;
              SND.hit();
            } else if (d < -50) e.done = true;
          } else if (e.type === 'bird') {
            if (Math.abs(d) < 40 && top > BIRD_LOW && g.y < BIRD_HIGH && !hurt) {
              e.done = true;
              g.hitUntil = now + 600;
              SND.hit();
            } else if (d < -50) e.done = true;
          } else if (e.type === 'star') {
            if (Math.abs(d) < 34 && Math.abs(g.y + 35 - (e.h ?? 0)) < 50) {
              e.done = true;
              SND.star();
              setRunStars((n) => n + 1);
              cb.current.onStar();
            } else if (d < -50) e.done = true;
          } else if (e.type === 'gate') {
            if (d <= 110) {
              g.dist = e.x - 110;
              g.mode = 'gate';
              openGate(e);
            }
          } else if (e.type === 'finish') {
            if (d <= 0) {
              g.mode = 'done';
              e.done = true;
              SND.gate();
              speakLines(cb.current.heb
                ? [en('Finish!'), he(`הגעת לסוף השלב! ${POKEMON[wild]?.he ?? ''} מחכה לך - בואי נתפוס אותו!`)]
                : [en(`Finish! ${POKEMON[wild]?.name ?? ''} is waiting for you!`)]);
              setTimeout(() => cb.current.onFinish(), 2600);
            }
          }
          // הדרכה (רק בפעם הראשונה): עוצרים לפני האבן הראשונה ולפני הציפור הראשונה עד שהיא לוחצת
          if (g.tutStep < 2 && g.mode === 'run') {
            const want = g.tutStep === 0 ? 'rock' : 'bird';
            if (e.type === want && d > 0 && d < (want === 'rock' ? 150 : 120)) {
              g.mode = 'tutorial';
              setTut(want === 'rock' ? 'jump' : 'duck');
              speakLines(cb.current.heb
                ? (want === 'rock'
                  ? [he('אבן בדרך! תלחצי על הכפתור הצהוב כדי לקפוץ!'), en('Jump!')]
                  : [he('ציפור! תלחצי על הכפתור הכחול כדי להתכופף!'), en('Duck!')])
                : [en(want === 'rock' ? 'A rock! Jump!' : 'A bird! Duck!')]);
            }
          }
        }
        const p = Math.min(100, Math.round((g.dist / g.len) * 100));
        if (p !== lastPct) {
          lastPct = p;
          setPct(p);
        }
      }

      // ---------- ציור ----------
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#bfe9ff');
      sky.addColorStop(1, '#fff6d8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // עננים וגבעות זזים לאט יותר מהקרקע (תחושת עומק)
      for (let i = 0; i < 4; i++) {
        const cx = ((i * 260 - g.dist * 0.1) % (W + 300) + W + 300) % (W + 300) - 100;
        emoji('☁️', cx, 70 + (i % 2) * 40, 44);
      }
      ctx.fillStyle = world.color;
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 6; i++) {
        const hx = ((i * 220 - g.dist * 0.3) % (W + 440) + W + 440) % (W + 440) - 220;
        ctx.beginPath();
        ctx.arc(hx, GROUND + 30, 120 + (i % 3) * 30, Math.PI, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7cc66b';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#5aa64b';
      ctx.fillRect(0, GROUND, W, 6);
      ctx.fillStyle = '#6bb85b';
      for (let i = 0; i < W / 40 + 2; i++) {
        const sx = i * 40 - (g.dist % 40);
        ctx.fillRect(sx, GROUND + 18, 20, 5);
      }

      for (const e of g.ents) {
        const sx = PLAYER_X + (e.x - g.dist);
        if (sx < -120) continue;
        if (sx > W + 120) break;
        if (e.type === 'rock') emoji('🪨', sx, GROUND + 4, 44);
        else if (e.type === 'bird') emoji('🐦', sx, GROUND - BIRD_LOW + 2 + Math.sin(now / 150) * 4, 40);
        else if (e.type === 'star' && !e.done) emoji('⭐', sx, GROUND - (e.h ?? 0) + 14 + Math.sin(now / 200 + e.x) * 3, 30);
        else if (e.type === 'gate') {
          if (!e.done) {
            ctx.fillStyle = '#8d5a2b';
            ctx.fillRect(sx - 6, GROUND - 150, 12, 150);
            emoji('🚧', sx, GROUND + 2, 64);
            emoji('🔒', sx, GROUND - 150, 40);
          } else {
            emoji('✨', sx, GROUND - 60, 40);
          }
        } else if (e.type === 'finish') {
          emoji('🏁', sx, GROUND, 70);
          if (imgs.wild.complete && imgs.wild.naturalWidth) ctx.drawImage(imgs.wild, sx + 30, GROUND - 100, 100, 100);
        }
      }

      // השחקן
      const ducking = now < g.duckUntil && g.y === 0;
      const hurt = now < g.hitUntil;
      if (!(hurt && Math.floor(now / 90) % 2)) {
        const bob = g.y === 0 && g.mode === 'run' && !hurt ? Math.abs(Math.sin(g.dist / 18)) * 5 : 0;
        const size = 84;
        const hgt = ducking ? size * 0.55 : size;
        const bottom = GROUND - g.y - bob + 4;
        if (imgs.partner.complete && imgs.partner.naturalWidth) {
          ctx.drawImage(imgs.partner, PLAYER_X - size / 2, bottom - hgt, size, hgt);
        } else emoji('⚡', PLAYER_X, bottom, 50);
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); jump(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); duck(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    talk(heb
      ? [en("Ready? Let's run!"), he(`שלב ${stage + 1}! קופצים מעל אבנים, מתכופפים מתחת לציפורים, ואוספים כוכבים!`)]
      : [en(`Stage ${stage + 1}! Ready? Let's run!`)]);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gates = G.current.ents.filter((e) => e.type === 'gate');
  const micSupported = canListen();

  return (
    <div className={s.root} style={{ ['--world' as string]: world.color }}>
      <div className={s.battleTop}>
        <button className={s.iconBtn} onClick={() => { stopSpeaking(); props.onExit(); }} aria-label="map">🗺️</button>
        <div className={s.track} dir="ltr">
          {gates.map((e, i) => (
            <span key={i} className={s.trackMark} style={{ left: `${(e.x / G.current.len) * 100}%` }}>{e.done ? '✨' : '🔒'}</span>
          ))}
          <span className={s.trackMark} style={{ left: '100%' }}>🏁</span>
          <span className={s.trackFill} style={{ width: `${pct}%` }} />
        </div>
        <span className={s.stars}>⭐ {runStars}</span>
      </div>

      <div ref={wrapRef} className={s.runWrap}>
        <canvas ref={canvasRef} className={s.runCanvas} />
        {tut && (
          <div className={s.tutBox}>
            {tut === 'jump' ? '⬇️ לחצי על "קפיצה"!' : '⬇️ לחצי על "התכופפות"!'}
          </div>
        )}
      </div>

      {gate ? (
        <div className={s.gatePanel}>
          <div className={s.bigPic}>{gate.word.pic}</div>
          <div className={s.bubble} onClick={() => talk([he(gate.sent.he), en(gate.sent.en)])}>
            {bubble.map((l, i) => (
              <div key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'} className={l.lang === 'he' ? s.bubbleHe : undefined}>
                {l.text}
              </div>
            ))}
            <span className={s.replay}>🔊</span>
          </div>
          <div className={s.row}>
            {micSupported && (
              <button className={`${s.mic} ${listening ? s.micOn : ''}`} onClick={onMic} disabled={busy}>🎤</button>
            )}
          </div>
          <div className={s.helpRow}>
            <button className={s.smallBtn} onClick={() => talk([en(gate.sent.en)])}>🔊 שוב</button>
            <button className={s.smallBtn} onClick={() => talk([he(gate.sent.he), en(gate.sent.en)])}>🇮🇱 עזרה</button>
            {/* בלי זיהוי דיבור, או אחרי 3 ניסיונות (לפעמים המיקרופון פשוט לא קולט מבטא) - אמא יכולה לאשר */}
            {(!micSupported || gate.fails >= 3) && (
              <button className={s.smallBtn} onClick={() => { cb.current.onWord(gate.word.en, true); passGate(); }}>
                👩 אמא שמעה - ממשיכים
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className={s.bubbleLine}>
            {bubble.map((l, i) => (
              <span key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'}>{l.text} </span>
            ))}
          </div>
          <div className={s.controls}>
            <button
              className={`${s.ctlBtn} ${s.ctlJump} ${tut === 'jump' ? s.ctlHint : ''}`}
              onPointerDown={(e) => { e.preventDefault(); jump(); }}
            >
              ⬆️<span>קפיצה</span>
            </button>
            <button
              className={`${s.ctlBtn} ${s.ctlDuck} ${tut === 'duck' ? s.ctlHint : ''}`}
              onPointerDown={(e) => { e.preventDefault(); duck(); }}
            >
              ⬇️<span>התכופפות</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
