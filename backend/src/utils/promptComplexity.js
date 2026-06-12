const RELATION_TERMS = [
  "بجانب",
  "بجانبه",
  "فوق",
  "على",
  "داخل",
  "خلف",
  "أمام",
  "امام",
  "بين",
  "مع",
  "يمسك",
  "يحمل",
  "تحمل",
  "يرتدي",
  "يلبس",
  "يقود",
  "راكب",
  "يأكل",
  "يلتهم",
  "يطير",
  "next to",
  "beside",
  "above",
  "inside",
  "behind",
  "in front of",
  "between",
  "with",
  "holding",
  "wearing",
  "driving",
  "riding",
];

const COLOR_GROUPS = [
  ["أسود", "اسود", "سوداء", "black"],
  ["أبيض", "ابيض", "بيضاء", "white"],
  ["أحمر", "احمر", "حمراء", "red"],
  ["أخضر", "اخضر", "خضراء", "green"],
  ["أصفر", "اصفر", "صفراء", "yellow"],
  ["أزرق", "ازرق", "زرقاء", "blue"],
  ["بنفسجي", "بنفسجية", "purple"],
  ["برتقالي", "برتقالية", "orange"],
  ["وردي", "وردية", "pink"],
];

const SUBJECT_GROUPS = [
  ["رجل أعمال", "رجل اعمال", "businessman"],
  ["رجل", "man"],
  ["امرأة", "امراة", "woman"],
  ["شخص", "person"],
  ["أسد", "اسد", "لبؤة", "lion", "lioness"],
  ["غزال", "gazelle", "deer"],
  ["قطيع", "pride", "herd"],
  ["كلب", "dog"],
  ["قط", "قطة", "cat"],
  ["ذئب", "ذيب", "wolf"],
  ["ثعبان", "ثعابين", "أفعى", "افعى", "snake"],
  ["دجاجة", "دجاج", "chicken"],
  ["سلحفاة", "turtle"],
  ["روبوت", "ربوت", "robot"],
  ["سيارة", "صيارة", "car"],
  ["منزل", "بيت", "house", "home"],
  ["قمر", "moon"],
  ["فضاء", "space"],
  ["حديقة", "garden"],
  ["شاطئ", "شاطي", "beach"],
  ["حوت", "whale"],
  ["حصان", "horse"],
  ["فيل", "elephant"],
  ["سمكة", "سمك", "fish"],
  ["بومة", "owl"],
  ["طائر", "bird"],
  ["جمل", "camel"],
  ["قطار", "train"],
  ["ساعة", "clock"],
  ["بركان", "volcano"],
  ["وردة", "زهرة", "rose", "flower"],
];

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFor(value) {
  return new Set(normalizeText(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

function containsTerm(text, tokens, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return text.includes(normalizedTerm);
  if (tokens.has(normalizedTerm)) return true;
  if (normalizedTerm.length < 3) return false;

  const possessiveSuffixes = ["ه", "ها", "هم", "هن", "نا", "ي", "ك", "كم", "كن"];
  return possessiveSuffixes.some((suffix) => tokens.has(`${normalizedTerm}${suffix}`));
}

function countGroups(text, tokens, groups) {
  return groups.filter((group) => group.some((term) => containsTerm(text, tokens, term))).length;
}

export function analyzePromptComplexity(prompt) {
  const text = normalizeText(prompt);
  const tokens = tokensFor(prompt);
  const relations = RELATION_TERMS.filter((term) => containsTerm(text, tokens, term)).length;
  const colors = countGroups(text, tokens, COLOR_GROUPS);
  const subjects = countGroups(text, tokens, SUBJECT_GROUPS);
  const wordCount = text ? text.split(" ").length : 0;

  return {
    complex: subjects >= 2 || relations >= 1 || colors >= 2 || wordCount >= 10,
    relations,
    colors,
    subjects,
    wordCount,
  };
}

export function isComplexGenerationPrompt(prompt) {
  return analyzePromptComplexity(prompt).complex;
}
