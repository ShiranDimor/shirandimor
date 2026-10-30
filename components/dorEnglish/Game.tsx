'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CATCHES_TO_UNLOCK, POKEMON, STARTERS, WORLDS, spriteUrl, type World } from './data';
import {
  EMPTY, hebrewOn, isKnown, isUnlocked, loadProgress, recordAnswer, saveProgress,
  type Progress,
} from './progress';
import {
  canListen, en, hasHebrewVoice, he, speak, speakLines, stopSpeaking, type Line,
} from './speech';
import Runner from './Runner';
import s from './game.module.css';

type Screen = 'title' | 'starter' | 'map' | 'run' | 'catch' | 'caught' | 'pokedex' | 'parents';

// משחק הזריקה: העיגול סביב הפוקימון מתכווץ בלולאה; זורקים בזמן שהוא קטן
const RING_MS = 1700;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const nameOf = (id: number) => POKEMON[id]?.name ?? 'Pokémon';
const heNameOf = (id: number) => POKEMON[id]?.he ?? 'פוקימון';

function Sprite({ id, size, hidden, className }: { id: number; size: number; hidden?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span style={{ fontSize: size * 0.6 }}>❓</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(id)}
      alt={hidden ? '?' : heNameOf(id)}
      width={size}
      height={size}
      className={`${className ?? ''} ${hidden ? s.silhouette : ''}`}
      onError={() => setBroken(true)}
      draggable={false}
    />
  );
}

// כל עולם = 3 שלבים, ובסוף כל שלב מחכה אחד משלושת הפוקימונים של העולם.
// ממשיכים מהשלב הראשון שעוד לא נתפס; אם כולם נתפסו - שלב אקראי לתרגול
function nextStage(p: Progress, w: World) {
  const i = w.pokemon.findIndex((id) => !p.caught.includes(id));
  return i >= 0 ? i : Math.floor(Math.random() * w.pokemon.length);
}

export default function Game() {
  const [p, setP] = useState<Progress>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>('title');

  useEffect(() => {
    setP(loadProgress());
    setLoaded(true);
  }, []);

  const update = useCallback((fn: (prev: Progress) => Progress) => {
    setP((prev) => {
      const next = fn(prev);
      saveProgress(next);
      return next;
    });
  }, []);

  const [world, setWorld] = useState<World>(WORLDS[0]);
  const [stage, setStage] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [wildId, setWildId] = useState<number>(WORLDS[0].pokemon[0]);
  const [phase, setPhase] = useState<'throw' | 'catching'>('throw');
  const [ball, setBall] = useState<'none' | 'miss' | 'catch'>('none');
  const [misses, setMisses] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bubble, setBubble] = useState<Line[]>([]);
  const [result, setResult] = useState({ great: false, isNew: false });
  const ringStart = useRef(0);
  const pRef = useRef(p);
  pRef.current = p;

  const heb = hebrewOn(p);

  const talk = useCallback(async (lines: Line[]) => {
    setBubble(lines);
    await speakLines(lines);
  }, []);

  const startStage = useCallback((w: World, st?: number) => {
    const i = st ?? nextStage(pRef.current, w);
    setWorld(w);
    setStage(i);
    setWildId(w.pokemon[i]);
    setRunKey((k) => k + 1);
    setScreen('run');
  }, []);

  // סוף המסלול: הפוקימון הפראי מחכה - משחק הזריקה
  const startCatch = useCallback(() => {
    setPhase('throw');
    setBall('none');
    setMisses(0);
    setBusy(false);
    ringStart.current = performance.now();
    setScreen('catch');
    talk(hebrewOn(pRef.current)
      ? [en(`A wild ${nameOf(wildId)}!`), he(`עכשיו זורקים עליו כדור פוקימון. תלחצי על הכפתור האדום כשהעיגול הכי קטן וירוק!`)]
      : [en(`A wild ${nameOf(wildId)}! Throw a Poké Ball when the circle is small!`)]);
  }, [talk, wildId]);

  const onThrow = useCallback(async () => {
    if (busy || phase !== 'throw') return;
    setBusy(true);
    stopSpeaking();
    const t = ((performance.now() - ringStart.current) % RING_MS) / RING_MS;
    // אחרי 2 פספוסים הזריקה השלישית תמיד מצליחה - שלא תתבאס
    const good = t > 0.55 || misses >= 2;
    if (!good) {
      setBall('miss');
      await wait(900);
      setBall('none');
      setMisses((m) => m + 1);
      await talk(heb
        ? [en('Oh no!'), he('פספסת! נסי שוב - תלחצי כשהעיגול קטן וירוק.')]
        : [en('Oh no, missed! Try again when the circle is small!')]);
      setBusy(false);
      return;
    }
    const great = t > 0.8;
    const isNew = !pRef.current.caught.includes(wildId);
    setPhase('catching');
    setBall('catch');
    await Promise.all([talk([en(great ? 'Excellent throw!' : 'Nice throw!')]), wait(3000)]);
    update((prev) => ({
      ...prev,
      caught: prev.caught.includes(wildId) ? prev.caught : [...prev.caught, wildId],
      stars: prev.stars + 5 + (great ? 3 : 0),
    }));
    setResult({ great, isNew });
    setScreen('caught');
    const partner = pRef.current.starter;
    const levelUp = partner && isNew ? [en(`${nameOf(partner)} grew to level ${6 + pRef.current.caught.length}!`)] : [];
    talk(heb
      ? [en('Gotcha!'), he(`תפסת את ${heNameOf(wildId)}! כל הכבוד דור!`), ...levelUp]
      : [en(`Gotcha! You caught ${nameOf(wildId)}! Great job, Dor!`), ...levelUp]);
    setBusy(false);
  }, [busy, heb, misses, phase, talk, update, wildId]);

  useEffect(() => () => stopSpeaking(), []);

  if (!loaded) return <div className={s.root} />;

  const starter = p.starter;

  // ---------- מסכים ----------
  if (screen === 'title') {
    return (
      <div className={s.root}>
        <div className={s.title}>
          <div className={s.titleBalls}>
            <Sprite id={starter ?? 25} size={170} className={s.bounce} />
          </div>
          <h1 className={s.logo}>ההרפתקה<br />של דור</h1>
          <p className={s.sub}>פוקימונים באנגלית</p>
          <button
            className={s.bigBtn}
            onClick={() => {
              // הלחיצה הראשונה "פותחת" את הסאונד בספארי - בלי זה הקראה לא תעבוד באייפד
              const hi = starter ? en("Welcome back, Dor! Let's play!") : en("Hello Dor! Let's go on a Pokémon adventure!");
              speakLines(heb ? [hi, he(starter ? 'ברוכה השבה דור! בואי נשחק!' : 'שלום דור! בואי נצא להרפתקת פוקימונים באנגלית!')] : [hi]);
              setScreen(starter ? 'map' : 'starter');
            }}
          >
            ▶ בואי נשחק!
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'starter') {
    return (
      <StarterPick
        heb={heb}
        onDone={(id) => {
          update((prev) => ({ ...prev, starter: id }));
          setScreen('map');
          speakLines(heb
            ? [en(`${nameOf(id)}, I choose you!`), he(`${heNameOf(id)} הוא השותף שלך! עכשיו בחרי עולם, ובואי נרוץ!`)]
            : [en(`${nameOf(id)} is your partner! Let's go!`)]);
        }}
      />
    );
  }

  if (screen === 'pokedex') return <Pokedex p={p} heb={heb} onBack={() => { stopSpeaking(); setScreen('map'); }} />;

  if (screen === 'parents') return <Parents p={p} onBack={() => setScreen('map')} onToggleHebrew={() => update((prev) => ({ ...prev, hebrew: !hebrewOn(prev) }))} onReset={() => { update(() => EMPTY); setScreen('title'); }} />;

  if (screen === 'run' && starter) {
    return (
      <Runner
        key={runKey}
        world={world}
        worldIndex={WORLDS.indexOf(world)}
        stage={stage}
        partner={starter}
        wild={wildId}
        heb={heb}
        progress={() => pRef.current}
        showTutorial={!p.tutorialDone}
        onWord={(word, ok) => update((prev) => recordAnswer(prev, word, ok, ok))}
        onStar={() => update((prev) => ({ ...prev, stars: prev.stars + 1 }))}
        onTutorialDone={() => update((prev) => ({ ...prev, tutorialDone: true }))}
        onFinish={startCatch}
        onExit={() => setScreen('map')}
      />
    );
  }

  if (screen === 'caught') {
    const nextOpen = WORLDS.indexOf(world) + 1 < WORLDS.length && isUnlocked(p, WORLDS.indexOf(world) + 1);
    return (
      <div className={s.root}>
        <div className={s.caught}>
          <div className={s.confetti}>🎉 ⭐ 🎉 ⭐ 🎉</div>
          <Sprite id={wildId} size={220} className={s.pop} />
          <h2 className={s.caughtTitle}>תפסת!</h2>
          <p className={s.caughtSub}>תפסת את <b>{heNameOf(wildId)}</b>!</p>
          {result.great && <p className={s.caughtSub}>זריקה מושלמת! 🎯</p>}
          <p className={s.he}><span dir="ltr">+{5 + (result.great ? 3 : 0)} ⭐</span></p>
          {starter && result.isNew && (
            <p className={s.levelUp}>
              <Sprite id={starter} size={44} /> {heNameOf(starter)} עלה לרמה {5 + p.caught.length}! ⬆️
            </p>
          )}
          <div className={s.row}>
            <button className={s.bigBtn} onClick={() => { stopSpeaking(); startStage(world); }}>▶ לשלב הבא!</button>
            <button className={s.midBtn} onClick={() => { stopSpeaking(); setScreen('map'); }}>🗺️ למפה</button>
            <button className={s.midBtn} onClick={() => setScreen('pokedex')}>📕 האוסף שלי</button>
          </div>
          {nextOpen && result.isNew && <p className={s.he}>🔓 נפתח עולם חדש במפה!</p>}
        </div>
      </div>
    );
  }

  if (screen === 'catch') {
    return (
      <div className={s.root} style={{ ['--world' as string]: world.color }}>
        <div className={s.battleTop}>
          <button className={s.iconBtn} onClick={() => { stopSpeaking(); setScreen('map'); }} aria-label="map">🗺️</button>
          <span className={s.stars}>⭐ {p.stars}</span>
        </div>
        <div className={s.arena}>
          <div className={s.hpBox}>
            <span className={s.hpName}>{heNameOf(wildId)}</span>
          </div>
          <div className={s.wild}>
            <div className={phase === 'throw' ? s.sway : s.wildCaught}>
              <Sprite id={wildId} size={150} />
            </div>
            {phase === 'throw' && <span className={s.ring} style={{ animationDuration: `${RING_MS}ms` }} />}
            {ball === 'catch' && <span className={s.ballCatch} />}
            {ball === 'miss' && <span className={s.ballMiss} />}
          </div>
          <div className={s.bubble}>
            {bubble.map((l, i) => (
              <div key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'} className={l.lang === 'he' ? s.bubbleHe : undefined}>
                {l.text}
              </div>
            ))}
          </div>
          {starter && (
            <div className={s.partner}>
              <Sprite id={starter} size={84} />
              <span className={s.lvl}>Lv {5 + p.caught.length}</span>
            </div>
          )}
        </div>
        {phase === 'throw' && (
          <div className={s.challenge}>
            <button className={s.throwBtn} onClick={onThrow} disabled={busy}>
              <span className={s.pokeball} /> זרקי!
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- מפה ----------
  return (
    <div className={s.root}>
      <div className={s.mapTop}>
        <div className={s.trainer}>
          {starter && <Sprite id={starter} size={56} />}
          <div>
            <div className={s.trainerName}>המאמנת דור</div>
            <div className={s.trainerSub}>⭐ {p.stars} · 📕 {p.caught.length} · Lv {5 + p.caught.length}</div>
          </div>
        </div>
        <button className={s.midBtn} onClick={() => { setScreen('pokedex'); speakLines(heb ? [he('האוסף שלי! כאן כל הפוקימונים שתפסת')] : [en('My Pokémon!')]); }}>📕 האוסף שלי</button>
      </div>

      <h2
        className={s.mapTitle}
        onClick={() => speakLines(heb ? [en('Where do you want to go?'), he('לאן את רוצה ללכת? תלחצי על עולם.')] : [en('Where do you want to go?')])}
      >
        לאן הולכים? 🔊
      </h2>

      <div className={s.worlds}>
        {WORLDS.map((w, i) => {
          const open = isUnlocked(p, i);
          const got = w.pokemon.filter((id) => p.caught.includes(id)).length;
          return (
            <button
              key={w.id}
              className={`${s.world} ${open ? '' : s.locked}`}
              style={{ ['--world' as string]: w.color }}
              onClick={() => {
                if (open) startStage(w);
                else if (heb) speakLines([he(`העולם הזה עוד נעול. קודם צריך לעבור ${CATCHES_TO_UNLOCK} שלבים ב${WORLDS[i - 1].he}.`)]);
                else speak(`Locked! Finish ${CATCHES_TO_UNLOCK} stages in ${WORLDS[i - 1].name} first.`);
              }}
            >
              <span className={s.worldIcon}>{open ? w.icon : '🔒'}</span>
              <span className={s.worldName}>{w.he}</span>
              <span className={s.worldMons}>
                {w.pokemon.map((id) => (
                  <Sprite key={id} id={id} size={34} hidden={!p.caught.includes(id)} />
                ))}
              </span>
              <span className={s.worldCount}>שלב {Math.min(got + 1, w.pokemon.length)}/{w.pokemon.length}</span>
            </button>
          );
        })}
      </div>

      <button className={s.parentsLink} onClick={() => setScreen('parents')}>👩 לאמא / להורים</button>
    </div>
  );
}

function StarterPick({ heb, onDone }: { heb: boolean; onDone: (id: number) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const intro = heb
    ? [en('Choose your partner!'), he('בחרי את הפוקימון שילווה אותך בהרפתקה. תלחצי עליו, ואז על הכפתור האדום.')]
    : [en('Choose your partner Pokémon!')];
  useEffect(() => {
    const t = setTimeout(() => speakLines(intro), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={s.root}>
      <h2 className={s.mapTitle} onClick={() => speakLines(intro)}>בחרי שותף לדרך! 🔊</h2>
      <p className={s.he}>לוחצים על פוקימון כדי לשמוע את השם שלו</p>
      <div className={s.starters}>
        {STARTERS.map((id) => (
          <button
            key={id}
            className={`${s.starter} ${sel === id ? s.starterOn : ''}`}
            onClick={() => { setSel(id); speak(`${nameOf(id)}!`); }}
          >
            <Sprite id={id} size={110} />
            <span>{heNameOf(id)}</span>
          </button>
        ))}
      </div>
      {sel && <button className={s.bigBtn} onClick={() => onDone(sel)}>בחרתי! ✨</button>}
    </div>
  );
}

function Pokedex({ p, heb, onBack }: { p: Progress; heb: boolean; onBack: () => void }) {
  const all = [...(p.starter ? [p.starter] : []), ...WORLDS.flatMap((w) => w.pokemon)];
  return (
    <div className={s.root}>
      <div className={s.mapTop}>
        <button className={s.iconBtn} onClick={onBack} aria-label="back">🗺️</button>
        <h2 className={s.mapTitle}>האוסף שלי · {p.caught.length + (p.starter ? 1 : 0)}/{all.length}</h2>
      </div>
      <div className={s.dex}>
        {all.map((id) => {
          const have = id === p.starter || p.caught.includes(id);
          return (
            <button
              key={id}
              className={s.dexCard}
              onClick={() => {
                if (have) speak(`${nameOf(id)}! Hello, Dor!`);
                else if (heb) speakLines([he('מי זה? צריך לתפוס אותו כדי לגלות!')]);
                else speak('Who is this? Catch it to find out!');
              }}
            >
              <Sprite id={id} size={80} hidden={!have} />
              <span>{have ? heNameOf(id) : '???'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Parents({ p, onBack, onToggleHebrew, onReset }: {
  p: Progress; onBack: () => void; onToggleHebrew: () => void; onReset: () => void;
}) {
  const allWords = WORLDS.flatMap((w) => w.words);
  const known = allWords.filter((w) => isKnown(p.words[w.en])).length;
  const hardest = allWords
    .filter((w) => (p.words[w.en]?.wrong ?? 0) > 0)
    .sort((a, b) => (p.words[b.en]!.wrong - p.words[b.en]!.right * 0.5) - (p.words[a.en]!.wrong - p.words[a.en]!.right * 0.5))
    .slice(0, 6);
  return (
    <div className={s.root} dir="rtl">
      <div className={s.parents}>
        <button className={s.smallBtn} onClick={onBack}>→ חזרה למשחק</button>
        <h2>מסך הורים</h2>
        <div className={s.statRow}>
          <div><b>{p.days.length}</b><span>ימי משחק</span></div>
          <div><b>{known}/{allWords.length}</b><span>מילים שהיא יודעת</span></div>
          <div><b>{p.caught.length}</b><span>פוקימונים נתפסו</span></div>
        </div>
        <label className={s.toggle}>
          <input type="checkbox" checked={hebrewOn(p)} onChange={onToggleHebrew} />
          <span>
            הוראות בעברית
            <small>הפוקימון מסביר בעברית מה לעשות, והמילים עצמן באנגלית. כשהיא תבין יותר - אפשר לכבות ולעבור לאנגלית בלבד.</small>
          </span>
        </label>
        {hebrewOn(p) && !hasHebrewVoice() && (
          <p className={s.parentsNote}>
            ⚠️ לא נמצא במכשיר הזה קול בעברית, אז ההוראות עלולות להישמע לא ברור. באייפד/אייפון יש קול עברי מובנה;
            באנדרואיד אפשר להוסיף עברית בהגדרות ← &quot;המרת טקסט לדיבור&quot;.
          </p>
        )}
        {hardest.length > 0 && (
          <>
            <h3>מילים שכדאי לתרגל איתה</h3>
            <p className={s.parentsNote}>{hardest.map((w) => `${w.pic} ${w.en} (${w.he})`).join(' · ')}</p>
          </>
        )}
        {WORLDS.map((w) => (
          <div key={w.id}>
            <h3>{w.icon} {w.he}</h3>
            <table className={s.table}>
              <tbody>
                {/* בעולם הצירופים יש עשרות צירופים - מציגים רק את מה שכבר תרגלה */}
                {w.words.filter((word) => w.id !== 'combos' || p.words[word.en]).map((word) => {
                  const st = p.words[word.en];
                  return (
                    <tr key={word.en}>
                      <td>{word.pic}</td>
                      <td dir="ltr">{word.en}</td>
                      <td>{word.he}</td>
                      <td dir="ltr">{st ? `✓${st.right} ✗${st.wrong} 🎤${st.said}` : '—'}</td>
                      <td>{isKnown(st) ? '✅' : st ? '🟡' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <p className={s.parentsNote}>
          ההתקדמות נשמרת על המכשיר הזה בלבד. 🎤 = כמה פעמים אמרה את המילה בקול וזוהתה.
          {!canListen() && ' בדפדפן הזה אין זיהוי דיבור - כדאי לפתוח בכרום או בספארי.'}
        </p>
        <button
          className={s.dangerBtn}
          onClick={() => { if (confirm('לאפס את כל ההתקדמות של דור?')) onReset(); }}
        >
          איפוס התקדמות
        </button>
      </div>
    </div>
  );
}
