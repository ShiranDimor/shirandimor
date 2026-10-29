'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATCHES_TO_UNLOCK, POKEMON, PRAISE, STARTERS, TRY_AGAIN, WORLDS, fill, spriteUrl, withArticle,
  type Word, type World,
} from './data';
import {
  EMPTY, distractors, hebrewOn, isKnown, isUnlocked, loadProgress, pickWord, recordAnswer, saveProgress, shuffle,
  type Progress,
} from './progress';
import {
  canListen, en, hasHebrewVoice, he, heardWord, listenOnce, speak, speakLines, stopSpeaking, type Line,
} from './speech';
import s from './game.module.css';

type Screen = 'title' | 'starter' | 'map' | 'battle' | 'caught' | 'pokedex' | 'parents';
type Kind = 'listen' | 'story' | 'say';

interface Challenge {
  kind: Kind;
  word: Word;
  options: Word[];
  lines: Line[]; // מה הפוקימון אומר כשהמשימה מתחילה (הוראה בעברית + השאלה באנגלית)
  target: Line[]; // החלק באנגלית בלבד - חוזרים עליו אחרי טעות
}

const HITS_TO_CATCH = 5;

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const nameOf = (id: number) => POKEMON[id]?.name ?? 'Pokémon';
const heNameOf = (id: number) => POKEMON[id]?.he ?? 'פוקימון';

function Sprite({ id, size, hidden, className }: { id: number; size: number; hidden?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span style={{ fontSize: size * 0.6 }}>❓</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(id)}
      alt={hidden ? '?' : nameOf(id)}
      width={size}
      height={size}
      className={`${className ?? ''} ${hidden ? s.silhouette : ''}`}
      onError={() => setBroken(true)}
      draggable={false}
    />
  );
}

function askQuestion(world: World) {
  if (world.id === 'colors') return 'What color is this?';
  if (world.id === 'numbers') return 'How many stars?';
  return 'What is this?';
}

function buildChallenge(p: Progress, world: World, kind: Kind, wildId: number, avoid: string[]): Challenge {
  const { word, world: source } = pickWord(p, world, avoid);
  const optionCount = WORLDS.indexOf(world) === 0 && Object.keys(p.words).length < 15 ? 3 : 4;
  const options = shuffle([word, ...distractors(source, word, optionCount - 1)]);
  const heb = hebrewOn(p);
  if (kind === 'say') {
    // מילה חדשה (עוד לא אמרה אותה בהצלחה פעמיים) - קודם אומרים לה אותה; מילה מוכרת - רק שואלים
    const modeled = (p.words[word.en]?.said ?? 0) < 2;
    const q = askQuestion(source);
    const target = [en(word.en)];
    if (!heb) {
      const prompt = modeled ? `${q} It is ${withArticle(word)}. Now you say: ${word.en}!` : q;
      return { kind, word, options, lines: [en(prompt)], target };
    }
    const lines = modeled
      ? [en(q), he(`זה ${word.he}. באנגלית אומרים:`), en(withArticle(word)), he('עכשיו תלחצי על המיקרופון ותגידי:'), en(word.en)]
      : [en(q), he('איך אומרים את זה באנגלית? תלחצי על המיקרופון ותגידי.')];
    return { kind, word, options, lines, target: modeled ? target : [en(q)] };
  }
  const template = kind === 'story' ? rand(source.stories) : rand(source.listen);
  const target = [en(fill(template, word, nameOf(wildId)))];
  if (!heb) return { kind, word, options, lines: target, target };
  const intro = kind === 'story'
    ? he(`${heNameOf(wildId)} מספר לך משהו באנגלית. תקשיבי, ותלחצי על התמונה הנכונה:`)
    : he('תקשיבי, ותלחצי על התמונה הנכונה:');
  return { kind, word, options, lines: [intro, ...target], target };
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

  // ---- קרב / תפיסה ----
  const [world, setWorld] = useState<World>(WORLDS[0]);
  const [wildId, setWildId] = useState<number>(WORLDS[0].pokemon[0]);
  const [hits, setHits] = useState(0);
  const [plan, setPlan] = useState<Kind[]>([]);
  const [ch, setCh] = useState<Challenge | null>(null);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [sayFails, setSayFails] = useState(0);
  const [bubble, setBubble] = useState<Line[]>([]);
  const [throwing, setThrowing] = useState(false);
  const recent = useRef<string[]>([]);
  const pRef = useRef(p);
  pRef.current = p;

  const heb = hebrewOn(p);

  // הפוקימון "מדבר": מציג את השורות בבועה ואומר אותן ברצף
  const talk = useCallback(async (lines: Line[]) => {
    setBubble(lines);
    await speakLines(lines);
  }, []);

  const nextChallenge = useCallback((w: World, wild: number, kinds: Kind[], hitIndex: number) => {
    const kind = kinds[hitIndex] ?? 'listen';
    const c = buildChallenge(pRef.current, w, kind, wild, recent.current);
    recent.current = [...recent.current.slice(-3), c.word.en];
    setCh(c);
    setWrongPicks([]);
    setSayFails(0);
    setBusy(false);
    setTimeout(() => talk(c.lines), 350);
  }, [talk]);

  const startBattle = useCallback(async (w: World) => {
    const notCaught = w.pokemon.filter((id) => !pRef.current.caught.includes(id));
    const wild = rand(notCaught.length ? notCaught : w.pokemon);
    const kinds = shuffle<Kind>(['listen', 'story', 'say', 'listen', 'say']);
    setWorld(w);
    setWildId(wild);
    setHits(0);
    setPlan(kinds);
    setCh(null);
    setThrowing(false);
    setScreen('battle');
    recent.current = [];
    setBusy(true);
    await talk(hebrewOn(pRef.current)
      ? [en(`A wild ${nameOf(wild)} appeared!`), he(`${heNameOf(wild)} פראי הופיע! כדי לתפוס אותו צריך לענות נכון חמש פעמים. בהצלחה!`)]
      : [en(`A wild ${nameOf(wild)} appeared! Let's catch it!`)]);
    nextChallenge(w, wild, kinds, 0);
  }, [nextChallenge, talk]);

  const onHit = useCallback(async (spoken: boolean) => {
    if (!ch) return;
    setBusy(true);
    update((prev) => ({ ...recordAnswer(prev, ch.word.en, true, spoken), stars: prev.stars + 1 }));
    const newHits = hits + 1;
    setHits(newHits);
    await talk([
      en(`${rand(PRAISE)} ${spoken ? '' : ch.word.en + '!'}`),
      ...(heb ? [he(rand(['כל הכבוד!', 'מעולה!', 'יפה מאוד!', 'נכון!']))] : []),
    ]);
    if (newHits >= HITS_TO_CATCH) {
      setThrowing(true);
      await talk([en('Go, Poké Ball!')]);
      await new Promise((r) => setTimeout(r, 1600));
      update((prev) => ({
        ...prev,
        caught: prev.caught.includes(wildId) ? prev.caught : [...prev.caught, wildId],
        stars: prev.stars + 5,
      }));
      setScreen('caught');
      talk(heb
        ? [en('Gotcha!'), he(`תפסת את ${heNameOf(wildId)}! כל הכבוד דור!`)]
        : [en(`Gotcha! You caught ${nameOf(wildId)}! Great job, Dor!`)]);
      return;
    }
    nextChallenge(world, wildId, plan, newHits);
  }, [ch, heb, hits, nextChallenge, plan, talk, update, wildId, world]);

  const onPick = useCallback(async (opt: Word) => {
    if (!ch || busy) return;
    if (opt.en === ch.word.en) return onHit(false);
    setBusy(true);
    setWrongPicks((w) => [...w, opt.en]);
    update((prev) => recordAnswer(prev, ch.word.en, false));
    // גם טעות מלמדת: אומרים לה מה היא בחרה, ואז חוזרים על השאלה
    await talk(heb
      ? [he('אופס! זה'), en(`${withArticle(opt)}.`), he('נסי שוב. תקשיבי:'), ...ch.target]
      : [en(`${rand(TRY_AGAIN)} That is ${withArticle(opt)}.`), ...ch.target]);
    setBusy(false);
  }, [busy, ch, heb, onHit, talk, update]);

  const onMic = useCallback(async () => {
    if (!ch || busy || listening) return;
    setListening(true);
    setBubble([heb ? he('אני מקשיב... 👂') : en('I am listening... 👂')]);
    const heard = await listenOnce();
    setListening(false);
    if (heardWord(heard, ch.word.en, ch.word.accept)) return onHit(true);
    const fails = sayFails + 1;
    setSayFails(fails);
    if (fails >= 3) {
      // לא נותנים לה להיתקע ולהתבאס - אחרי 3 ניסיונות ממשיכים הלאה (ונרשם כטעות לתרגול חוזר)
      update((prev) => recordAnswer(prev, ch.word.en, false));
      setBusy(true);
      await talk(heb
        ? [he('ניסיון יפה! באנגלית אומרים:'), en(`${ch.word.en}.`), he('נמשיך הלאה.')]
        : [en(`Good try! It is ${ch.word.en}. ${ch.word.en}!`)]);
      nextChallenge(world, wildId, plan, hits);
      return;
    }
    const again = heard.length ? 'כמעט! תלחצי על המיקרופון ותגידי שוב:' : 'לא שמעתי. תלחצי על המיקרופון ותגידי:';
    await talk(heb
      ? [he(again), en(ch.word.en)]
      : [en(heard.length ? `Hmm, say it again: ${ch.word.en}!` : `I didn't hear you. Say: ${ch.word.en}!`)]);
  }, [busy, ch, heb, hits, listening, nextChallenge, onHit, plan, sayFails, talk, update, wildId, world]);

  const hint = useCallback(async () => {
    if (!ch) return;
    await talk([he(`${ch.word.he}. באנגלית:`), en(`${ch.word.en}.`)]);
  }, [ch, talk]);

  useEffect(() => () => stopSpeaking(), []);

  if (!loaded) return <div className={s.root} />;

  const starter = p.starter;
  const micSupported = canListen();

  // ---------- מסכים ----------
  if (screen === 'title') {
    return (
      <div className={s.root}>
        <div className={s.title}>
          <div className={s.titleBalls}>
            <Sprite id={starter ?? 25} size={170} className={s.bounce} />
          </div>
          <h1 className={s.logo}>Dor&apos;s Pokémon<br />English Adventure</h1>
          <p className={s.sub}>ההרפתקה האנגלית של דור</p>
          <button
            className={s.bigBtn}
            onClick={() => {
              // הלחיצה הראשונה "פותחת" את הסאונד בספארי - בלי זה הקראה לא תעבוד באייפד
              const hi = starter ? en("Welcome back, Dor! Let's play!") : en("Hello Dor! Let's go on a Pokémon adventure!");
              speakLines(heb ? [hi, he(starter ? 'ברוכה השבה דור! בואי נשחק!' : 'שלום דור! בואי נצא להרפתקת פוקימונים באנגלית!')] : [hi]);
              setScreen(starter ? 'map' : 'starter');
            }}
          >
            ▶ Play!
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
            ? [en(`${nameOf(id)}, I choose you!`), he(`${heNameOf(id)} הוא השותף שלך! עכשיו בחרי עולם, ובואי נתפוס פוקימונים!`)]
            : [en(`${nameOf(id)} is your partner! Now, let's catch Pokémon!`)]);
        }}
      />
    );
  }

  if (screen === 'pokedex') return <Pokedex p={p} heb={heb} onBack={() => { stopSpeaking(); setScreen('map'); }} />;

  if (screen === 'parents') return <Parents p={p} onBack={() => setScreen('map')} onToggleHebrew={() => update((prev) => ({ ...prev, hebrew: !hebrewOn(prev) }))} onReset={() => { update(() => EMPTY); setScreen('title'); }} />;

  if (screen === 'caught') {
    return (
      <div className={s.root}>
        <div className={s.caught}>
          <div className={s.confetti}>🎉 ⭐ 🎉 ⭐ 🎉</div>
          <Sprite id={wildId} size={220} className={s.pop} />
          <h2 className={s.caughtTitle}>Gotcha!</h2>
          <p className={s.caughtSub}>You caught <b>{nameOf(wildId)}</b>!</p>
          <p className={s.he}>תפסת את {POKEMON[wildId]?.he}! <span dir="ltr">+5 ⭐</span></p>
          <div className={s.row}>
            <button className={s.bigBtn} onClick={() => startBattle(world)}>⚡ Again!</button>
            <button className={s.midBtn} onClick={() => { stopSpeaking(); setScreen('map'); }}>🗺️ Map</button>
            <button className={s.midBtn} onClick={() => setScreen('pokedex')}>📕 Pokédex</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'battle') {
    return (
      <div className={s.root} style={{ ['--world' as string]: world.color }}>
        <div className={s.battleTop}>
          <button className={s.iconBtn} onClick={() => { stopSpeaking(); setScreen('map'); }} aria-label="map">🗺️</button>
          <div className={s.balls}>
            {Array.from({ length: HITS_TO_CATCH }, (_, i) => (
              <span key={i} className={`${s.ball} ${i < hits ? s.ballOn : ''}`} />
            ))}
          </div>
          <span className={s.stars}>⭐ {p.stars}</span>
        </div>

        <div className={s.arena}>
          <div className={`${s.wild} ${throwing ? s.wildCaught : ''}`}>
            <Sprite id={wildId} size={150} className={throwing ? '' : s.float} />
            {throwing && <span className={s.thrownBall} />}
          </div>
          <div className={s.bubble} onClick={() => ch && talk(ch.lines)}>
            {bubble.map((l, i) => (
              <div key={i} dir={l.lang === 'he' ? 'rtl' : 'ltr'} className={l.lang === 'he' ? s.bubbleHe : undefined}>
                {l.text}
              </div>
            ))}
            <span className={s.replay}>🔊</span>
          </div>
          {starter && (
            <div className={s.partner}>
              <Sprite id={starter} size={84} />
            </div>
          )}
        </div>

        {ch && !throwing && (
          <div className={s.challenge}>
            {ch.kind === 'say' ? (
              <div className={s.sayBox}>
                <div className={s.bigPic}>{ch.word.pic}</div>
                {micSupported ? (
                  <button className={`${s.mic} ${listening ? s.micOn : ''}`} onClick={onMic} disabled={busy}>
                    🎤
                  </button>
                ) : null}
                {(!micSupported || sayFails >= 1) && (
                  <button className={s.midBtn} onClick={() => onHit(true)} disabled={busy || listening}>
                    🗣️ I said it! <small>(אמרתי!)</small>
                  </button>
                )}
              </div>
            ) : (
              <div className={`${s.options} ${ch.options.length === 4 ? s.four : ''}`}>
                {ch.options.map((o) => (
                  <button
                    key={o.en}
                    className={`${s.option} ${wrongPicks.includes(o.en) ? s.optionWrong : ''}`}
                    onClick={() => onPick(o)}
                    disabled={wrongPicks.includes(o.en)}
                  >
                    <span className={s.optionPic}>{o.pic}</span>
                  </button>
                ))}
              </div>
            )}
            <div className={s.helpRow}>
              <button className={s.smallBtn} onClick={() => talk(ch.lines)}>🔊 Again</button>
              <button className={s.smallBtn} onClick={hint}>🇮🇱 עזרה</button>
            </div>
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
            <div className={s.trainerName}>Trainer Dor</div>
            <div className={s.trainerSub}>⭐ {p.stars} · 📕 {p.caught.length}</div>
          </div>
        </div>
        <button className={s.midBtn} onClick={() => { setScreen('pokedex'); speakLines(heb ? [en('Pokédex!'), he('כאן כל הפוקימונים שתפסת')] : [en('Pokédex!')]); }}>📕 Pokédex</button>
      </div>

      <h2
        className={s.mapTitle}
        onClick={() => speakLines(heb ? [en('Where do you want to go?'), he('לאן את רוצה ללכת? תלחצי על עולם.')] : [en('Where do you want to go?')])}
      >
        Where do you want to go? 🔊
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
                if (open) startBattle(w);
                else if (heb) speakLines([he(`העולם הזה עוד נעול. קודם צריך לתפוס ${CATCHES_TO_UNLOCK} פוקימונים ב${WORLDS[i - 1].he}.`)]);
                else speak(`Locked! Catch ${CATCHES_TO_UNLOCK} Pokémon in ${WORLDS[i - 1].name} first.`);
              }}
            >
              <span className={s.worldIcon}>{open ? w.icon : '🔒'}</span>
              <span className={s.worldName}>{w.name}</span>
              <span className={s.worldHe}>{w.he}</span>
              <span className={s.worldMons}>
                {w.pokemon.map((id) => (
                  <Sprite key={id} id={id} size={34} hidden={!p.caught.includes(id)} />
                ))}
              </span>
              <span className={s.worldCount}>{got}/{w.pokemon.length}</span>
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
      <h2 className={s.mapTitle} onClick={() => speakLines(intro)}>Choose your partner! 🔊</h2>
      <p className={s.he}>בחרי את הפוקימון שילווה אותך</p>
      <div className={s.starters}>
        {STARTERS.map((id) => (
          <button
            key={id}
            className={`${s.starter} ${sel === id ? s.starterOn : ''}`}
            onClick={() => { setSel(id); speak(`${nameOf(id)}!`); }}
          >
            <Sprite id={id} size={110} />
            <span>{nameOf(id)}</span>
          </button>
        ))}
      </div>
      {sel && <button className={s.bigBtn} onClick={() => onDone(sel)}>I choose you! ✨</button>}
    </div>
  );
}

function Pokedex({ p, heb, onBack }: { p: Progress; heb: boolean; onBack: () => void }) {
  const all = [...(p.starter ? [p.starter] : []), ...WORLDS.flatMap((w) => w.pokemon)];
  return (
    <div className={s.root}>
      <div className={s.mapTop}>
        <button className={s.iconBtn} onClick={onBack} aria-label="back">🗺️</button>
        <h2 className={s.mapTitle}>Pokédex · {p.caught.length + (p.starter ? 1 : 0)}/{all.length}</h2>
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
              <span>{have ? nameOf(id) : '???'}</span>
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
                {w.words.map((word) => {
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
