// תוכן המשחק של דור: עולמות (נושאים), מילים בכל עולם, והפוקימונים שאפשר לתפוס בכל עולם.
// כדי להוסיף מילים מהשיעורים הפרטיים - פשוט מוסיפים שורה ל-words של העולם המתאים.

export interface Word {
  en: string;
  he: string;
  pic: string; // אימוג'י שמשמש כתמונה - הילדה עוד לא קוראת, אז כל תשובה היא תמונה
  article?: string; // 'a' כברירת מחדל; 'an' / 'some' / '' לפי הצורך במשפט
  accept?: string[]; // הגיות/תעתיקים נוספים שזיהוי הדיבור עשוי להחזיר (למשל "two" -> "2")
}

export interface World {
  id: string;
  name: string;
  he: string;
  icon: string;
  color: string;
  pokemon: number[]; // מספרי פוקדקס שאפשר לתפוס בעולם הזה
  words: Word[];
  // משפט "סיפור" שהפוקימון אומר - {p} = שם הפוקימון, {w} = המילה עם ה-article שלה
  stories: string[];
  // שאלת הקשבה קצרה - {w} = המילה עם ה-article / {x} = המילה בלבד
  listen: string[];
}

export const STARTERS = [25, 1, 4, 7, 133];

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
};

export function spriteUrl(id: number) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

export const WORLDS: World[] = [
  {
    id: 'colors',
    name: 'Rainbow Meadow',
    he: 'אחו הקשת',
    icon: '🌈',
    color: '#ff8fb1',
    pokemon: [39, 43, 10],
    words: [
      { en: 'red', he: 'אדום', pic: '🔴', article: '' },
      { en: 'blue', he: 'כחול', pic: '🔵', article: '' },
      { en: 'green', he: 'ירוק', pic: '🟢', article: '' },
      { en: 'yellow', he: 'צהוב', pic: '🟡', article: '' },
      { en: 'orange', he: 'כתום', pic: '🟠', article: '' },
      { en: 'purple', he: 'סגול', pic: '🟣', article: '' },
      { en: 'pink', he: 'ורוד', pic: '🩷', article: '' },
      { en: 'black', he: 'שחור', pic: '⚫', article: '' },
      { en: 'white', he: 'לבן', pic: '⚪', article: '' },
    ],
    stories: ['{p} wants the {x} ball!', '{p} loves the color {x}!', 'My favorite color is {x}. Find {x}!'],
    listen: ['Where is {x}?', 'Touch {x}!', 'Find the color {x}!'],
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
    ],
    stories: ['{p} has a new friend. It is {w}!', '{p} is playing with {w}!', 'Look! {p} found {w}!'],
    listen: ['Where is the {x}?', 'Find the {x}!', 'Can you see the {x}?'],
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
    ],
    stories: ['{p} is hungry. {p} wants {w}!', 'Yummy! {p} is eating {w}!', '{p} says: I like {w}!'],
    listen: ['Where is the {x}?', 'Give me the {x}, please!', 'Find the {x}!'],
  },
  {
    id: 'numbers',
    name: 'Number Mountain',
    he: 'הר המספרים',
    icon: '⛰️',
    color: '#7fa7ff',
    pokemon: [51, 81, 102],
    words: [
      { en: 'one', he: 'אחת', pic: '⭐', article: '', accept: ['1', 'won'] },
      { en: 'two', he: 'שתיים', pic: '⭐⭐', article: '', accept: ['2', 'to', 'too'] },
      { en: 'three', he: 'שלוש', pic: '⭐⭐⭐', article: '', accept: ['3', 'tree', 'free'] },
      { en: 'four', he: 'ארבע', pic: '⭐⭐\n⭐⭐', article: '', accept: ['4', 'for'] },
      { en: 'five', he: 'חמש', pic: '⭐⭐⭐\n⭐⭐', article: '', accept: ['5'] },
      { en: 'six', he: 'שש', pic: '⭐⭐⭐\n⭐⭐⭐', article: '', accept: ['6', 'sicks'] },
    ],
    stories: ['{p} has {x} stars. Find {x} stars!', '{p} can count to {x}!', 'Let\'s count with {p}: {x}!'],
    listen: ['Where are {x} stars?', 'Find {x}!', 'Touch {x} stars!'],
  },
  {
    id: 'body',
    name: 'Dojo of the Body',
    he: 'דוג׳ו הגוף',
    icon: '🥋',
    color: '#c58cff',
    pokemon: [66, 106, 122],
    words: [
      { en: 'eye', he: 'עין', pic: '👁️', article: 'an', accept: ['i', 'eyes'] },
      { en: 'ear', he: 'אוזן', pic: '👂', article: 'an', accept: ['ears'] },
      { en: 'nose', he: 'אף', pic: '👃', accept: ['knows'] },
      { en: 'mouth', he: 'פה', pic: '👄' },
      { en: 'hand', he: 'יד', pic: '✋', accept: ['hands'] },
      { en: 'foot', he: 'כף רגל', pic: '🦶', accept: ['feet'] },
      { en: 'leg', he: 'רגל', pic: '🦵', accept: ['legs'] },
      { en: 'tooth', he: 'שן', pic: '🦷', accept: ['teeth'] },
    ],
    stories: ['{p} says: touch your {x}!', 'Ouch! {p} hurt his {x}!', '{p} is washing his {x}!'],
    listen: ['Where is the {x}?', 'Show me the {x}!', 'Find the {x}!'],
  },
  {
    id: 'home',
    name: 'Cozy House',
    he: 'הבית החמים',
    icon: '🏠',
    color: '#ffd84d',
    pokemon: [54, 35, 175],
    words: [
      { en: 'ball', he: 'כדור', pic: '⚽' },
      { en: 'book', he: 'ספר', pic: '📖' },
      { en: 'car', he: 'מכונית', pic: '🚗' },
      { en: 'house', he: 'בית', pic: '🏠' },
      { en: 'bed', he: 'מיטה', pic: '🛏️' },
      { en: 'sun', he: 'שמש', pic: '☀️', article: 'the' },
      { en: 'tree', he: 'עץ', pic: '🌳' },
      { en: 'flower', he: 'פרח', pic: '🌸' },
      { en: 'star', he: 'כוכב', pic: '⭐' },
      { en: 'moon', he: 'ירח', pic: '🌙', article: 'the' },
    ],
    stories: ['{p} is looking for {w}!', '{p} wants to play. {p} needs {w}!', 'Oh no! {p} lost {w}!'],
    listen: ['Where is the {x}?', 'Find the {x}!', 'Can you find the {x}?'],
  },
];

// כמה פוקימונים צריך לתפוס בעולם כדי לפתוח את העולם הבא
export const CATCHES_TO_UNLOCK = 2;

export const PRAISE = ['Great job!', 'Awesome!', 'Super!', 'You did it!', 'Wow, amazing!', 'Well done!', 'Yes! Perfect!'];
export const TRY_AGAIN = ['Oops! Try again!', 'Almost! Try again!', 'Not this one. Try again!'];

export function withArticle(w: Word) {
  const a = w.article === undefined ? 'a' : w.article;
  return a ? `${a} ${w.en}` : w.en;
}

export function fill(template: string, w: Word, pokemonName: string) {
  return template.replaceAll('{p}', pokemonName).replaceAll('{w}', withArticle(w)).replaceAll('{x}', w.en);
}
