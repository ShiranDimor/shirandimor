// תוכן המשחק של דור: עולמות (נושאים), מילים בכל עולם, והפוקימונים שאפשר לתפוס בכל עולם.
// כדי להוסיף מילים מהשיעורים הפרטיים - פשוט מוסיפים שורה ל-words של העולם המתאים.

export interface Word {
  en: string;
  he: string;
  pic: string; // אימוג'י שמשמש כתמונה - הילדה עוד לא קוראת, אז כל תשובה היא תמונה
  article?: string; // 'a' כברירת מחדל; 'an' / 'some' / '' לפי הצורך במשפט
  accept?: string[]; // הגיות/תעתיקים נוספים שזיהוי הדיבור עשוי להחזיר
}

export interface World {
  id: string;
  name: string;
  he: string;
  icon: string;
  color: string;
  pokemon: number[]; // מספרי פוקדקס שאפשר לתפוס בעולם הזה
  words: Word[];
  // המשפט שאומרים כדי לפתוח שער במסלול. {w} = המילה עם ה-article שלה, {x} = המילה בלבד,
  // {p} = שם הפוקימון השותף; בעברית {he} = המילה ו-{phe} = שם השותף
  sentence: { en: string; he: string };
}

export const STARTERS = [25, 1, 4, 7, 133];

// ההתקפה של הפוקימון השותף בכל תשובה נכונה
export const MOVES: Record<number, { en: string; fx: string }> = {
  25: { en: 'Thunderbolt', fx: '⚡' },
  1: { en: 'Vine Whip', fx: '🍃' },
  4: { en: 'Ember', fx: '🔥' },
  7: { en: 'Water Gun', fx: '💧' },
  133: { en: 'Swift', fx: '⭐' },
};

export const POKEMON: Record<number, { name: string; he: string }> = {
  1: { name: 'Bulbasaur', he: 'בולבזאור' },
  4: { name: 'Charmander', he: "צ'רמנדר" },
  7: { name: 'Squirtle', he: 'סקווירטל' },
  25: { name: 'Pikachu', he: "פיקאצ'ו" },
  133: { name: 'Eevee', he: 'איבי' },
  39: { name: 'Jigglypuff', he: "ג'יגליפאף" },
  43: { name: 'Oddish', he: 'אודיש' },
  10: { name: 'Caterpie', he: 'קטרפי' },
  52: { name: 'Meowth', he: 'מיאות' },
  58: { name: 'Growlithe', he: 'גראוליט' },
  16: { name: 'Pidgey', he: "פידג'י" },
  143: { name: 'Snorlax', he: 'סנורלקס' },
  113: { name: 'Chansey', he: 'צ׳נסי' },
  446: { name: 'Munchlax', he: 'מנצ׳לקס' },
  51: { name: 'Dugtrio', he: 'דאגטריו' },
  81: { name: 'Magnemite', he: 'מגנמייט' },
  102: { name: 'Exeggcute', he: 'אקזקיוט' },
  66: { name: 'Machop', he: "מאצ'ופ" },
  106: { name: 'Hitmonlee', he: 'היטמונלי' },
  122: { name: 'Mr. Mime', he: 'מיסטר מיים' },
  54: { name: 'Psyduck', he: 'סיידאק' },
  35: { name: 'Clefairy', he: 'קלפיירי' },
  175: { name: 'Togepi', he: 'טוגפי' },
  60: { name: 'Poliwag', he: 'פוליוואג' },
  63: { name: 'Abra', he: 'אברה' },
  77: { name: 'Ponyta', he: 'פוניטה' },
  79: { name: 'Slowpoke', he: 'סלופוק' },
  104: { name: 'Cubone', he: 'קיובון' },
  393: { name: 'Piplup', he: 'פיפלאפ' },
};

export function spriteUrl(id: number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

// ---------- עולם הצבעים והמספרים: את המילים עצמן היא כבר יודעת, אז כאן מחברים אותן לצירופים ----------
// ("three cats", "two blue hearts") - רבים, מספר + שם עצם, מספר + צבע + שם עצם

const NUMS = [
  { en: 'one', he: 'אחד' },
  { en: 'two', he: 'שני' },
  { en: 'three', he: 'שלושה' },
  { en: 'four', he: 'ארבעה' },
  { en: 'five', he: 'חמישה' },
];

// רק שמות עצם בזכר - כדי שהתרגום לעברית (מספר + צבע) ייצא תקין
const COUNT_NOUNS = [
  { en: 'cat', pl: 'cats', he: 'חתול', hePl: 'חתולים', pic: '🐱' },
  { en: 'dog', pl: 'dogs', he: 'כלב', hePl: 'כלבים', pic: '🐶' },
  { en: 'fish', pl: 'fish', he: 'דג', hePl: 'דגים', pic: '🐟' },
  { en: 'apple', pl: 'apples', he: 'תפוח', hePl: 'תפוחים', pic: '🍎' },
  { en: 'star', pl: 'stars', he: 'כוכב', hePl: 'כוכבים', pic: '⭐' },
  { en: 'ball', pl: 'balls', he: 'כדור', hePl: 'כדורים', pic: '⚽' },
  { en: 'duck', pl: 'ducks', he: 'ברווז', hePl: 'ברווזים', pic: '🦆' },
];

const COLORS: Record<string, [string, string]> = {
  red: ['אדום', 'אדומים'],
  blue: ['כחול', 'כחולים'],
  green: ['ירוק', 'ירוקים'],
  yellow: ['צהוב', 'צהובים'],
  orange: ['כתום', 'כתומים'],
  purple: ['סגול', 'סגולים'],
  pink: ['ורוד', 'ורודים'],
  black: ['שחור', 'שחורים'],
  white: ['לבן', 'לבנים'],
};

const HEARTS: Record<string, string> = {
  red: '❤️', blue: '💙', green: '💚', yellow: '💛', orange: '🧡', purple: '💜', pink: '🩷', black: '🖤', white: '🤍',
};
const BOOKS: Record<string, string> = { red: '📕', green: '📗', blue: '📘', orange: '📙' };

// 4-5 פריטים נשברים לשתי שורות כדי שיהיה קל לספור
function repeat(pic: string, n: number) {
  if (n <= 3) return pic.repeat(n);
  return `${pic.repeat(Math.ceil(n / 2))}\n${pic.repeat(Math.floor(n / 2))}`;
}

function buildCombos(): Word[] {
  const out: Word[] = [];
  for (const noun of COUNT_NOUNS) {
    NUMS.forEach((num, i) => {
      const n = i + 1;
      out.push({
        en: `${num.en} ${n === 1 ? noun.en : noun.pl}`,
        he: n === 1 ? `${noun.he} אחד` : `${num.he} ${noun.hePl}`,
        pic: repeat(noun.pic, n),
        article: '',
      });
    });
  }
  for (const [color, [heS, heP]] of Object.entries(COLORS)) {
    out.push({ en: `${color} heart`, he: `לב ${heS}`, pic: HEARTS[color] });
    for (const n of [2, 3]) {
      out.push({
        en: `${NUMS[n - 1].en} ${color} hearts`,
        he: `${NUMS[n - 1].he} לבבות ${heP}`,
        pic: HEARTS[color].repeat(n),
        article: '',
      });
    }
  }
  for (const [color, pic] of Object.entries(BOOKS)) {
    out.push({ en: `${color} book`, he: `ספר ${COLORS[color][0]}`, pic });
  }
  return out;
}

export const WORLDS: World[] = [
  {
    id: 'combos',
    name: 'Color & Number Mountain',
    he: 'הר הצבעים והמספרים',
    icon: '⛰️',
    color: '#ff8fb1',
    pokemon: [39, 51, 81],
    words: buildCombos(),
    sentence: { en: 'I see {w}.', he: 'אני רואה {he}' },
  },
  {
    id: 'animals',
    name: 'Animal Forest',
    he: 'יער החיות',
    icon: '🌳',
    color: '#6cc070',
    pokemon: [52, 58, 16],
    words: [
      { en: 'cat', he: 'חתול', pic: '🐱' },
      { en: 'dog', he: 'כלב', pic: '🐶' },
      { en: 'fish', he: 'דג', pic: '🐟' },
      { en: 'bird', he: 'ציפור', pic: '🐦' },
      { en: 'horse', he: 'סוס', pic: '🐴' },
      { en: 'cow', he: 'פרה', pic: '🐮' },
      { en: 'rabbit', he: 'ארנב', pic: '🐰', accept: ['bunny'] },
      { en: 'duck', he: 'ברווז', pic: '🦆' },
      { en: 'frog', he: 'צפרדע', pic: '🐸' },
      { en: 'lion', he: 'אריה', pic: '🦁' },
      { en: 'monkey', he: 'קוף', pic: '🐵' },
      { en: 'elephant', he: 'פיל', pic: '🐘', article: 'an' },
      { en: 'turtle', he: 'צב', pic: '🐢' },
      { en: 'snake', he: 'נחש', pic: '🐍' },
    ],
    sentence: { en: 'I see {w}.', he: 'אני רואה {he}' },
  },
  {
    id: 'food',
    name: 'Snack Town',
    he: 'עיר החטיפים',
    icon: '🍰',
    color: '#ffb347',
    pokemon: [143, 113, 446],
    words: [
      { en: 'apple', he: 'תפוח', pic: '🍎', article: 'an' },
      { en: 'banana', he: 'בננה', pic: '🍌' },
      { en: 'pizza', he: 'פיצה', pic: '🍕', article: 'some' },
      { en: 'cake', he: 'עוגה', pic: '🍰' },
      { en: 'milk', he: 'חלב', pic: '🥛', article: 'some' },
      { en: 'egg', he: 'ביצה', pic: '🥚', article: 'an' },
      { en: 'bread', he: 'לחם', pic: '🍞', article: 'some' },
      { en: 'ice cream', he: 'גלידה', pic: '🍦', article: 'an', accept: ['icecream', 'ice-cream'] },
      { en: 'water', he: 'מים', pic: '💧', article: 'some' },
      { en: 'carrot', he: 'גזר', pic: '🥕' },
      { en: 'cookie', he: 'עוגייה', pic: '🍪' },
      { en: 'cheese', he: 'גבינה', pic: '🧀', article: 'some' },
      { en: 'grapes', he: 'ענבים', pic: '🍇', article: 'some' },
      { en: 'strawberry', he: 'תות', pic: '🍓' },
    ],
    sentence: { en: 'I want {w}.', he: 'אני רוצה {he}' },
  },
  {
    id: 'actions',
    name: 'Action Park',
    he: 'פארק התנועה',
    icon: '🎢',
    color: '#4fc3f7',
    pokemon: [60, 77, 106],
    words: [
      { en: 'run', he: 'לרוץ', pic: '🏃', article: '' },
      { en: 'swim', he: 'לשחות', pic: '🏊', article: '' },
      { en: 'sleep', he: 'לישון', pic: '😴', article: '' },
      { en: 'drink', he: 'לשתות', pic: '🥤', article: '' },
      { en: 'read', he: 'לקרוא', pic: '📖', article: '', accept: ['red'] },
      { en: 'sing', he: 'לשיר', pic: '🎤', article: '' },
      { en: 'dance', he: 'לרקוד', pic: '💃', article: '' },
      { en: 'fly', he: 'לעוף', pic: '✈️', article: '' },
      { en: 'ride', he: 'לרכוב', pic: '🚴', article: '' },
      { en: 'paint', he: 'לצייר', pic: '🎨', article: '' },
      { en: 'climb', he: 'לטפס', pic: '🧗', article: '' },
      { en: 'write', he: 'לכתוב', pic: '✍️', article: '', accept: ['right'] },
    ],
    sentence: { en: 'I can {x}.', he: 'אני יכולה {he}' },
  },
  {
    id: 'feelings',
    name: 'Feelings Lake',
    he: 'אגם הרגשות',
    icon: '💗',
    color: '#f48fb1',
    pokemon: [54, 79, 104],
    words: [
      { en: 'happy', he: 'שמח', pic: '😀', article: '' },
      { en: 'sad', he: 'עצוב', pic: '😢', article: '' },
      { en: 'angry', he: 'כועס', pic: '😠', article: '' },
      { en: 'scared', he: 'מפחד', pic: '😱', article: '' },
      { en: 'tired', he: 'עייף', pic: '🥱', article: '' },
      { en: 'sick', he: 'חולה', pic: '🤒', article: '' },
      { en: 'silly', he: 'מצחיק', pic: '🤪', article: '' },
      { en: 'surprised', he: 'מופתע', pic: '😮', article: '' },
      { en: 'hungry', he: 'רעב', pic: '😋', article: '' },
      { en: 'cold', he: 'קר', pic: '🥶', article: '' },
      { en: 'hot', he: 'חם', pic: '🥵', article: '' },
    ],
    sentence: { en: '{p} is {x}.', he: '{phe} {he}' },
  },
  {
    id: 'body',
    name: 'Dojo of the Body',
    he: 'דוג׳ו הגוף',
    icon: '🥋',
    color: '#c58cff',
    pokemon: [66, 63, 102],
    words: [
      { en: 'eye', he: 'עין', pic: '👁️', article: 'an', accept: ['eyes'] },
      { en: 'ear', he: 'אוזן', pic: '👂', article: 'an', accept: ['ears'] },
      { en: 'nose', he: 'אף', pic: '👃', accept: ['knows'] },
      { en: 'mouth', he: 'פה', pic: '👄' },
      { en: 'hand', he: 'יד', pic: '✋', accept: ['hands'] },
      { en: 'foot', he: 'כף רגל', pic: '🦶', accept: ['feet'] },
      { en: 'leg', he: 'רגל', pic: '🦵', accept: ['legs'] },
      { en: 'tooth', he: 'שן', pic: '🦷', accept: ['teeth'] },
      { en: 'brain', he: 'מוח', pic: '🧠' },
      { en: 'arm', he: 'זרוע', pic: '💪', article: 'an', accept: ['arms'] },
    ],
    sentence: { en: 'I have {w}.', he: 'יש לי {he}' },
  },
  {
    id: 'clothes',
    name: 'Clothes Shop',
    he: 'חנות הבגדים',
    icon: '👕',
    color: '#9fa8da',
    pokemon: [122, 10, 393],
    words: [
      { en: 'shirt', he: 'חולצה', pic: '👕' },
      { en: 'hat', he: 'כובע', pic: '🧢' },
      { en: 'shoes', he: 'נעליים', pic: '👟', article: '', accept: ['shoe'] },
      { en: 'dress', he: 'שמלה', pic: '👗' },
      { en: 'socks', he: 'גרביים', pic: '🧦', article: '', accept: ['sock'] },
      { en: 'pants', he: 'מכנסיים', pic: '👖', article: '' },
      { en: 'coat', he: 'מעיל', pic: '🧥' },
      { en: 'glasses', he: 'משקפיים', pic: '👓', article: '' },
      { en: 'scarf', he: 'צעיף', pic: '🧣' },
      { en: 'gloves', he: 'כפפות', pic: '🧤', article: '', accept: ['glove'] },
    ],
    sentence: { en: 'I wear {w}.', he: 'אני לובשת {he}' },
  },
  {
    id: 'home',
    name: 'Cozy House',
    he: 'הבית החמים',
    icon: '🏠',
    color: '#ffd84d',
    pokemon: [35, 175, 43],
    words: [
      { en: 'ball', he: 'כדור', pic: '⚽' },
      { en: 'book', he: 'ספר', pic: '📖' },
      { en: 'car', he: 'מכונית', pic: '🚗' },
      { en: 'house', he: 'בית', pic: '🏠' },
      { en: 'bed', he: 'מיטה', pic: '🛏️' },
      { en: 'sun', he: 'שמש', pic: '☀️', article: 'the' },
      { en: 'tree', he: 'עץ', pic: '🌳' },
      { en: 'flower', he: 'פרח', pic: '🌸' },
      { en: 'moon', he: 'ירח', pic: '🌙', article: 'the' },
      { en: 'chair', he: 'כיסא', pic: '🪑' },
      { en: 'door', he: 'דלת', pic: '🚪' },
      { en: 'clock', he: 'שעון', pic: '🕰️' },
    ],
    sentence: { en: 'I see {w}.', he: 'אני רואה {he}' },
  },
];

// כמה פוקימונים צריך לתפוס בעולם כדי לפתוח את העולם הבא
export const CATCHES_TO_UNLOCK = 2;

export const PRAISE = ['Great job!', 'Awesome!', 'Super!', 'You did it!', 'Wow, amazing!', 'Well done!', 'Yes! Perfect!'];

export function withArticle(w: Word) {
  const a = w.article === undefined ? 'a' : w.article;
  return a ? `${a} ${w.en}` : w.en;
}

// המשפט לשער: מה שמשמיעים לה (en/he) ומה שבודקים בזיהוי הדיבור (match - בלי שם הפוקימון,
// כי את השם זיהוי הדיבור כמעט אף פעם לא כותב נכון)
export function sentenceFor(world: World, w: Word, partner: { name: string; he: string }) {
  const fillEn = (name: string) =>
    world.sentence.en.replaceAll('{p}', name).replaceAll('{w}', withArticle(w)).replaceAll('{x}', w.en).trim();
  return {
    en: fillEn(partner.name),
    he: world.sentence.he.replaceAll('{phe}', partner.he).replaceAll('{he}', w.he),
    match: fillEn('').replace(/\.$/, ''),
  };
}
