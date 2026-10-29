'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATCHES_TO_UNLOCK, POKEMON, PRAISE, STARTERS, TRY_AGAIN, WORLDS, fill, spriteUrl, withArticle,
  type Word, type World,
} from './data';
import {
  EMPTY, distractors, isKnown, isUnlocked, loadProgress, pickWord, recordAnswer, saveProgress, shuffle,
  type Progress,
} from './progress';
import { canListen, heardWord, listenOnce, speak, stopSpeaking } from './speech';
import s from './game.module.css';

type Screen = 'title' | 'starter' | 'map' | 'battle' | 'caught' | 'pokedex' | 'parents';
type Kind = 'listen' | 'story' | 'say';

interface Challenge {
  kind: Kind;
  word: Word;
  options: Word[];
  prompt: string;
  modeled: boolean; // בתרגיל דיבור: האם הדמות אומרת לה קודם את המילה (מילים חדשות) או רק שואלת
}

const HITS_TO_CATCH = 5;

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const nameOf = (id: number) => POKEMON[id]?.name ?? 'Pokémon';

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

function buildChallenge(p: Progress, world: World, kind: Kind, wildName: string, avoid: string[]): Challenge {
  const { word, world: source } = pickWord(p, world, avoid);
  const optionCount = WORLDS.indexOf(world) === 0 && Object.keys(p.words).length < 15 ? 3 : 4;
  const options = shuffle([word, ...distractors(source, word, optionCount - 1)]);
  if (kind === 'say') {
    const modeled = (p.words[word.en]?.said ?? 0) < 2;
    const q = askQuestion(source);
    const prompt = modeled ? `${q} It is ${withArticle(word)}. Now you say: ${word.en}!` : q;
    return { kind, word, options, prompt, modeled };
  }
  const template = kind === 'story' ? rand(source.stories) : rand(source.listen);
  return { kind, word, options, prompt: fill(template, word, wildName), modeled: true };
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
  const [bubble, setBubble] = useState('');
  const [throwing, setThrowing] = useState(false);
  const recent = useRef<string[]>([]);
  const pRef = useRef(p);
  pRef.current = p;

  const say = useCallback(async (text: string, lang: 'en' | 'he' = 'en') => {
    if (lang === 'en') setBubble(text);
    await speak(text, { lang });
  }, []);

  const nextChallenge = useCallback((w: World, wild: number, kinds: Kind[], hitIndex: number) => {
    const kind = kinds[hitIndex] ?? 'listen';
    const c = buildChallenge(pRef.current, w, kind, nameOf(wild), recent.current);
    recent.current = [...recent.current.slice(-3), c.word.en];
    setCh(c);
    setWrongPicks([]);
    setSayFails(0);
    setBusy(false);
    setTimeout(() => say(c.prompt), 350);
  }, [say]);

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
    await say(`A wild ${nameOf(wild)} appeared! Let's catch it!`);
    nextChallenge(w, wild, kinds, 0);
  }, [nextChallenge, say]);

  const onHit = useCallback(async (spoken: boolean) => {
    if (!ch) return;
    setBusy(true);
    update((prev) => ({ ...recordAnswer(prev, ch.word.en, true, spoken), stars: prev.stars + 1 }));
    const newHits = hits + 1;
    setHits(newHits);
    await say(`${rand(PRAISE)} ${spoken ? '' : ch.word.en + '!'}`);
    if (newHits >= HITS_TO_CATCH) {
      setThrowing(true);
      setBubble('Go, Poké Ball!');
      await speak('Go, Poké Ball!');
      await new Promise((r) => setTimeout(r, 1600));
      update((prev) => ({
        ...prev,
        caught: prev.caught.includes(wildId) ? prev.caught : [...prev.caught, wildId],
        stars: prev.stars + 5,
      }));
      setScreen('caught');
      say(`Gotcha! You caught ${nameOf(wildId)}! Great job, Dor!`);
      return;
    }
    nextChallenge(world, wildId, plan, newHits);
  }, [ch, hits, nextChallenge, plan, say, update, wildId, world]);

  const onPick = useCallback(async (opt: Word) => {
    if (!ch || busy) return;
    if (opt.en === ch.word.en) return onHit(false);
    setBusy(true);
    setWrongPicks((w) => [...w, opt.en]);
    update((prev) => recordAnswer(prev, ch.word.en, false));
    // גם טעות מלמדת: אומרים לה מה היא בחרה, ואז חוזרים על השאלה
    await say(`${rand(TRY_AGAIN)} That is ${withArticle(opt)}.`);
    await say(ch.prompt);
    setBusy(false);
  }, [busy, ch, onHit, say, update]);

  const onMic = useCallback(async () => {
    if (!ch || busy || listening) return;
    setListening(true);
    setBubble('I am listening... 👂');
    const heard = await listenOnce();
    setListening(false);
    if (heardWord(heard, ch.word.en, ch.word.accept)) return onHit(true);
    const fails = sayFails + 1;
    setSayFails(fails);
    if (fails >= 3) {
      // לא נותנים לה להיתקע ולהתבאס - אחרי 3 ניסיונות ממשיכים הלאה (ונרשם כטעות לתרגול חוזר)
      update((prev) => recordAnswer(prev, ch.word.en, false));
      setBusy(true);
      await say(`Good try! It is ${ch.word.en}. ${ch.word.en}!`);
      nextChallenge(world, wildId, plan, hits);
      return;
    }
    await say(heard.length ? `Hmm, say it again: ${ch.word.en}!` : `I didn't hear you. Say: ${ch.word.en}!`);
  }, [busy, ch, hits, listening, nextChallenge, onHit, plan, say, sayFails, update, wildId, world]);

  const hint = useCallback(async () => {
    if (!ch) return;
    await speak(ch.word.he, { lang: 'he' });
    await say(`${ch.word.en}.`);
  }, [ch, say]);

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
              speak(starter ? `Welcome back, Dor! Let's play!` : `Hello Dor! Let's go on a Pokémon adventure!`);
              setScreen(starter ? 'map' : 'starter');
            }}
          >
            ▶ Play!
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'starter') return <StarterPick onDone={(id) => { update((prev) => ({ ...prev, starter: id })); setScreen('map'); speak(`${nameOf(id)} is your partner! Now, let's catch Pokémon!`); }} />;

  if (screen === 'pokedex') return <Pokedex p={p} onBack={() => { stopSpeaking(); setScreen('map'); }} />;

  if (screen === 'parents') return <Parents p={p} onBack={() => setScreen('map')} onReset={() => { update(() => EMPTY); setScreen('title'); }} />;

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
          <div className={s.bubble} onClick={() => ch && say(ch.prompt)}>
            {bubble} <span className={s.replay}>🔊</span>
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
              <button className={s.smallBtn} onClick={() => say(ch.prompt)}>🔊 Again</button>
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
        <button className={s.midBtn} onClick={() => { setScreen('pokedex'); speak('Pokédex!'); }}>📕 Pokédex</button>
      </div>

      <h2 className={s.mapTitle} onClick={() => speak('Where do you want to go?')}>Where do you want to go? 🔊</h2>

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
                if (open) { speak(w.name); startBattle(w); }
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

function StarterPick({ onDone }: { onDone: (id: number) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => speak('Choose your partner Pokémon!'), 2200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={s.root}>
      <h2 className={s.mapTitle} onClick={() => speak('Choose your partner Pokémon!')}>Choose your partner! 🔊</h2>
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

function Pokedex({ p, onBack }: { p: Progress; onBack: () => void }) {
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
              onClick={() => speak(have ? `${nameOf(id)}! Hello, Dor!` : 'Who is this? Catch it to find out!')}
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

function Parents({ p, onBack, onReset }: { p: Progress; onBack: () => void; onReset: () => void }) {
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
