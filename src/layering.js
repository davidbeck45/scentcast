// Layering: which bottles in a collection pair well with a given one. Pure.
//
// Each bottle becomes a profile over accord families, from its accords
// (strength-weighted votes) and its notes (mapped to families by name, heart
// and base weighted over top since they last on skin). A pair scores on
// - complement: families that are known to work together (vanilla + woody,
//   rose + oud, citrus + amber), or clash (aquatic + caramel);
// - bridge: some overlap ties them together, but near-duplicates add little;
// - contrast: one heavier bottle to anchor, one lighter to lift.
// Reasons name the actual notes behind the best complement and bridge.
// A partner that pairs with everything (a light citrus-woody) would top every
// list, so picks are scored against each partner's average pairing, like the
// engine's season "specialty".
import { heaviness } from './accords.js';

// First match wins, so specific names come before the words they contain
// ("orange blossom" before "orange", "bourbon vanilla" before "bourbon").
const NOTE_FAMILIES = [
  [/vanill|tonka|benzoin|maltol/, 'vanilla'],
  [/civet|castoreum|animalic|indol/, 'animalic'],
  [/oud|agarwood|kyara/, 'oud'],
  [/caramel|praline|toffee|butterscotch|dulce/, 'caramel'],
  [/meringue|sugar|syrup|waffle|marshmallow|candy|cotton|biscuit|cookie|cake|pastry|brown sugar/, 'sweet'],
  [/honey|beeswax/, 'honey'],
  [/cacao|cocoa|chocolate|coffee|espresso/, 'cacao'],
  [/almond|marzipan|cherry pit/, 'almond'],
  [/coconut/, 'coconut'],
  [/hazelnut|pistachio|peanut|sesame|chestnut|walnut|\bnuts?\b/, 'nutty'],
  [/milk|cream|rice|butter|lacton|yogurt|cheese/, 'lactonic'],
  [/tobacco/, 'tobacco'],
  [/whisk|bourbon|rum|cognac|brandy|liquor|wine|champagne|beer/, 'whiskey'],
  [/leather|suede|birch/, 'leather'],
  [/incense|olibanum|frankincense|myrrh|elemi|labdanum|styrax|opoponax|palo santo|resin|copal|balsam|tolu|peru/, 'balsamic'],
  [/amber|ambrox|cetalox|moxalone/, 'amber'],
  [/cinnamon|clove|nutmeg|saffron|cumin|anise|allspice|oriental|spicy notes|immortelle|curry/, 'warm spicy'],
  [/pepper|cardamom|ginger(?! flower)|coriander|timur|juniper|elemi/, 'fresh spicy'],
  [/lavender|lavandin/, 'lavender'],
  [/iris|orris/, 'iris'],
  [/violet/, 'violet'],
  [/jasmin|tuberose|orange blossom|neroli|ylang|gardenia|frangipani|hedione|white flower|ginger flower|magnolia|lily/, 'white floral'],
  [/rose|geranium/, 'rose'],
  [/peony|lilac|cyclamen|lotus|freesia|osmanthus|mimosa|heliotrope|flower|floral|blossom|petal/, 'floral'],
  [/musk|ambrett|cashmeran|galaxolide|habanolide/, 'musky'],
  [/powder|aldehyde/, 'powdery'],
  [/mango|pineapple|passion|papaya|guava|lychee|litchi|banana|coconut water/, 'tropical'],
  [/grapefruit|bergamot|lemon|lime|orange|mandarin|tangerine|clementine|yuzu|pomelo|petitgrain|citrus|verbena|citron/, 'citrus'],
  [/pear|apple|peach|plum|berry|berries|currant|cherry|fig|apricot|grape|melon|quince|pomegranate|rhubarb/, 'fruity'],
  [/sea|marine|aquatic|salt|water|calone|seaweed|algae/, 'aquatic'],
  [/ozon|steam|air|metallic|mineral/, 'ozonic'],
  [/mint|basil|sage|thyme|rosemary|artemisia|wormwood|tea|herb|tarragon|clary|bay leaf/, 'herbal'],
  [/moss/, 'mossy'],
  [/patchouli|vetiver|mushroom|earth|dust|soil|truffle|beet/, 'earthy'],
  [/cedar|sandal|guaiac|wood|oak|hinoki|sequoia|akigalawood|cypress|pine|cashmere|teak|ebony/, 'woody'],
  [/green|grass|leaf|leaves|galbanum|stem|tomato|ivy/, 'green'],
  [/paper|ink|pencil/, 'paper'],
  [/mung bean|egg|salted|savory|soy|umami/, 'savory'],
];
const FAMILY_ALIAS = { chocolate: 'cacao', cinnamon: 'warm spicy' };

// Families that work together (+) or fight (−), symmetric.
const PAIRS = [
  ['vanilla', 'woody', 0.9], ['vanilla', 'tobacco', 1], ['vanilla', 'lavender', 0.9], ['vanilla', 'fresh spicy', 0.7],
  ['vanilla', 'citrus', 0.6], ['vanilla', 'fruity', 0.7], ['vanilla', 'warm spicy', 0.7], ['vanilla', 'rose', 0.5],
  ['vanilla', 'oud', 0.7], ['vanilla', 'leather', 0.5], ['vanilla', 'musky', 0.5], ['vanilla', 'coconut', 0.6],
  ['vanilla', 'tropical', 0.5], ['vanilla', 'cacao', 0.7], ['vanilla', 'almond', 0.6], ['vanilla', 'nutty', 0.5],
  ['vanilla', 'whiskey', 0.7], ['vanilla', 'iris', 0.5], ['vanilla', 'powdery', 0.4], ['vanilla', 'amber', 0.5],
  ['vanilla', 'earthy', 0.5], ['vanilla', 'balsamic', 0.5], ['vanilla', 'lactonic', 0.6],
  ['sweet', 'woody', 0.6], ['sweet', 'citrus', 0.6], ['sweet', 'fresh spicy', 0.5], ['sweet', 'savory', 0.7],
  ['sweet', 'musky', 0.4], ['sweet', 'earthy', 0.5], ['sweet', 'herbal', 0.4], ['sweet', 'fruity', 0.3],
  ['caramel', 'woody', 0.7], ['caramel', 'savory', 0.9], ['caramel', 'tobacco', 0.8], ['caramel', 'citrus', 0.4],
  ['caramel', 'whiskey', 0.8], ['caramel', 'nutty', 0.7], ['caramel', 'fruity', 0.4], ['caramel', 'lactonic', 0.5],
  ['honey', 'tobacco', 0.9], ['honey', 'white floral', 0.6], ['honey', 'woody', 0.6], ['honey', 'floral', 0.5], ['honey', 'leather', 0.5],
  ['cacao', 'fruity', 0.7], ['cacao', 'rose', 0.5], ['cacao', 'woody', 0.6], ['cacao', 'warm spicy', 0.6],
  ['cacao', 'earthy', 0.7], ['cacao', 'citrus', 0.5],
  ['almond', 'fruity', 0.6], ['almond', 'woody', 0.5], ['almond', 'lactonic', 0.5], ['almond', 'floral', 0.4],
  ['nutty', 'woody', 0.5], ['nutty', 'lactonic', 0.4],
  ['lactonic', 'fruity', 0.7], ['lactonic', 'tropical', 0.7], ['lactonic', 'woody', 0.5], ['lactonic', 'white floral', 0.5],
  ['coconut', 'tropical', 0.9], ['coconut', 'white floral', 0.8], ['coconut', 'aquatic', 0.5], ['coconut', 'lactonic', 0.5],
  ['tropical', 'white floral', 0.7], ['tropical', 'musky', 0.5], ['tropical', 'citrus', 0.5],
  ['fruity', 'musky', 0.7], ['fruity', 'woody', 0.6], ['fruity', 'floral', 0.6], ['fruity', 'rose', 0.7],
  ['fruity', 'powdery', 0.4], ['fruity', 'earthy', 0.5], ['fruity', 'amber', 0.4],
  ['rose', 'oud', 1], ['rose', 'amber', 0.7], ['rose', 'woody', 0.6], ['rose', 'citrus', 0.5], ['rose', 'musky', 0.6],
  ['rose', 'powdery', 0.5], ['rose', 'leather', 0.6], ['rose', 'earthy', 0.7], ['rose', 'warm spicy', 0.6],
  ['oud', 'amber', 0.7], ['oud', 'leather', 0.6], ['oud', 'balsamic', 0.6], ['oud', 'warm spicy', 0.5],
  ['citrus', 'woody', 0.8], ['citrus', 'aromatic', 0.7], ['citrus', 'fresh spicy', 0.7], ['citrus', 'musky', 0.6],
  ['citrus', 'amber', 0.6], ['citrus', 'white floral', 0.6], ['citrus', 'green', 0.5], ['citrus', 'herbal', 0.5],
  ['citrus', 'earthy', 0.4], ['citrus', 'mossy', 0.6],
  ['aquatic', 'woody', 0.7], ['aquatic', 'citrus', 0.5], ['aquatic', 'aromatic', 0.6], ['aquatic', 'musky', 0.6], ['aquatic', 'amber', 0.5],
  ['ozonic', 'woody', 0.5], ['ozonic', 'citrus', 0.5],
  ['green', 'woody', 0.6], ['green', 'floral', 0.6], ['green', 'earthy', 0.6], ['green', 'white floral', 0.5],
  ['lavender', 'tobacco', 0.8], ['lavender', 'amber', 0.7], ['lavender', 'woody', 0.6], ['lavender', 'musky', 0.5],
  ['lavender', 'leather', 0.5], ['lavender', 'powdery', 0.4],
  ['aromatic', 'woody', 0.7], ['aromatic', 'amber', 0.6], ['aromatic', 'leather', 0.6], ['aromatic', 'fresh spicy', 0.5],
  ['herbal', 'woody', 0.6], ['herbal', 'citrus', 0.5],
  ['fresh spicy', 'woody', 0.7], ['fresh spicy', 'amber', 0.7], ['fresh spicy', 'leather', 0.5],
  ['warm spicy', 'amber', 0.8], ['warm spicy', 'woody', 0.7], ['warm spicy', 'tobacco', 0.7], ['warm spicy', 'balsamic', 0.6],
  ['soft spicy', 'woody', 0.6], ['soft spicy', 'floral', 0.5], ['soft spicy', 'amber', 0.5],
  ['tobacco', 'leather', 0.7], ['tobacco', 'woody', 0.7], ['tobacco', 'whiskey', 0.8], ['tobacco', 'amber', 0.6],
  ['whiskey', 'woody', 0.7], ['whiskey', 'amber', 0.6],
  ['leather', 'iris', 0.7], ['leather', 'woody', 0.6], ['leather', 'amber', 0.6],
  ['iris', 'powdery', 0.5], ['iris', 'woody', 0.6], ['iris', 'musky', 0.6], ['iris', 'violet', 0.6],
  ['violet', 'powdery', 0.5], ['violet', 'woody', 0.5],
  ['powdery', 'musky', 0.6], ['powdery', 'woody', 0.4],
  ['musky', 'woody', 0.6], ['musky', 'floral', 0.7], ['musky', 'white floral', 0.6], ['musky', 'amber', 0.6],
  ['white floral', 'woody', 0.6], ['white floral', 'amber', 0.5],
  ['floral', 'woody', 0.6], ['floral', 'amber', 0.4],
  ['amber', 'woody', 0.7], ['amber', 'balsamic', 0.6], ['balsamic', 'woody', 0.6],
  ['earthy', 'woody', 0.6], ['mossy', 'woody', 0.6], ['mossy', 'floral', 0.5],
  ['animalic', 'floral', 0.6], ['animalic', 'rose', 0.6], ['animalic', 'amber', 0.6], ['animalic', 'white floral', 0.7],
  ['savory', 'woody', 0.4], ['paper', 'woody', 0.5], ['paper', 'musky', 0.5],
  ['terpenic', 'woody', 0.6], ['terpenic', 'citrus', 0.5],
  ['aquatic', 'caramel', -0.8], ['aquatic', 'cacao', -0.8], ['aquatic', 'honey', -0.6], ['aquatic', 'vanilla', -0.3],
  ['aquatic', 'oud', -0.6], ['aquatic', 'tobacco', -0.6], ['aquatic', 'animalic', -0.7],
  ['ozonic', 'caramel', -0.8], ['ozonic', 'honey', -0.6], ['ozonic', 'oud', -0.6], ['ozonic', 'cacao', -0.6],
  ['green', 'caramel', -0.5], ['lavender', 'tropical', -0.5], ['citrus', 'animalic', -0.4],
  ['tropical', 'leather', -0.6], ['tropical', 'oud', -0.5], ['tropical', 'tobacco', -0.5],
  ['coconut', 'leather', -0.5], ['coconut', 'oud', -0.5],
];
const COMPLEMENT = new Map();
for (const [a, b, v] of PAIRS) {
  COMPLEMENT.set(`${a}|${b}`, v);
  COMPLEMENT.set(`${b}|${a}`, v);
}

// What the partner's family does to this bottle, for reason text.
const EFFECT = {
  woody: 'grounds', earthy: 'grounds', mossy: 'grounds', oud: 'deepens', leather: 'deepens', tobacco: 'deepens',
  amber: 'warms', balsamic: 'warms', 'warm spicy': 'spices up', 'soft spicy': 'spices up', whiskey: 'warms',
  citrus: 'brightens', fresh: 'brightens', green: 'freshens', aquatic: 'freshens', ozonic: 'freshens',
  herbal: 'freshens', aromatic: 'freshens', 'fresh spicy': 'sharpens', lavender: 'freshens', terpenic: 'sharpens',
  vanilla: 'rounds out', sweet: 'sweetens', caramel: 'sweetens', honey: 'sweetens', cacao: 'rounds out',
  almond: 'rounds out', nutty: 'rounds out', musky: 'softens', powdery: 'softens', iris: 'softens',
  lactonic: 'softens', coconut: 'softens', fruity: 'adds juice to', tropical: 'adds juice to',
  floral: 'adds petals to', rose: 'adds petals to', 'white floral': 'adds petals to', violet: 'adds petals to',
  animalic: 'adds skin to', savory: 'adds salt to', paper: 'dries out',
};
const SWEET = ['vanilla', 'sweet', 'caramel', 'honey', 'cacao', 'almond', 'nutty'];
const LAYER_WEIGHT = { top: 0.6, mid: 1, base: 1.2, all: 1 };
const NOTES_SHARE = 0.4; // of a profile, the rest from accords
const COMPLEMENT_FLOOR = 0.15;
const COMPLEMENT_SPAN = 0.25;
const MIN_SCORE = 0.4;
const GENERALIST_DAMPING = 1;
const GENERIC_NOTE = /notes?$|accord$|^(citruses|white flowers|flowers|spices|woods)$/;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const family = name => FAMILY_ALIAS[name] ?? name;
const cleanNote = n => String(n).toLowerCase().replace(/\s+/g, ' ').trim();

export function noteFamily(note) {
  const n = cleanNote(note);
  return NOTE_FAMILIES.find(([re]) => re.test(n))?.[1] ?? null;
}

// { family: share } summing to 1, plus the notes behind each family.
export function layerProfile(frag) {
  const acc = {}, fromNotes = {}, notesBy = {};
  let accTotal = 0, noteTotal = 0;
  for (const [a, s] of Object.entries(frag.accords)) {
    const f = family(a);
    acc[f] = (acc[f] ?? 0) + s;
    accTotal += s;
  }
  for (const [layer, list] of Object.entries(frag.notes ?? {})) {
    for (const note of list) {
      const f = noteFamily(note);
      if (!f) continue;
      const w = LAYER_WEIGHT[layer] ?? 1;
      fromNotes[f] = (fromNotes[f] ?? 0) + w;
      noteTotal += w;
      (notesBy[f] ??= []).push({ note: cleanNote(note), w });
    }
  }
  const noteShare = noteTotal ? NOTES_SHARE : 0;
  const profile = {};
  for (const [f, s] of Object.entries(acc)) profile[f] = (1 - noteShare) * s / accTotal;
  for (const [f, s] of Object.entries(fromNotes)) profile[f] = (profile[f] ?? 0) + noteShare * s / noteTotal;
  // Named notes before generic ones ("sandalwood" over "woody notes"), then heart and base.
  const rank = x => x.w - (GENERIC_NOTE.test(x.note) ? 1 : 0);
  for (const list of Object.values(notesBy)) list.sort((a, b) => rank(b) - rank(a));
  return { profile, notesBy };
}

const profiles = new WeakMap();
const profileOf = frag => {
  if (!profiles.has(frag)) profiles.set(frag, layerProfile(frag));
  return profiles.get(frag);
};

const cosine = (p, q) => {
  let dot = 0, np = 0, nq = 0;
  for (const f of new Set([...Object.keys(p), ...Object.keys(q)])) {
    dot += (p[f] ?? 0) * (q[f] ?? 0);
    np += (p[f] ?? 0) ** 2;
    nq += (q[f] ?? 0) ** 2;
  }
  return np && nq ? dot / Math.sqrt(np * nq) : 0;
};

// A note from the bottle for this family, else the family's own name.
const nameFor = (side, f) => side.notesBy[f]?.[0]?.note ?? f;
const isPlural = noun => /(notes|[^sui]s)$/.test(noun);
// "grounds" -> "ground", "dries out" -> "dry out", for plural subjects.
const pluralVerb = phrase => phrase.replace(/^(\w+?)(ies|s)\b/, (m, stem, end) => (end === 'ies' ? `${stem}y` : stem));

/**
 * How well `other` layers with `frag`.
 * -> { score 0..1, reasons: [{ text, tone }], first: the one to spray first }
 */
export function layerPair(frag, other) {
  const a = profileOf(frag), b = profileOf(other);

  // Complement: every family pair across the two, weighted by both shares.
  let complement = 0, clash = 0, best = null;
  for (const [fa, pa] of Object.entries(a.profile)) {
    for (const [fb, pb] of Object.entries(b.profile)) {
      if (fa === fb) continue;
      const c = pa * pb * (COMPLEMENT.get(`${fa}|${fb}`) ?? 0);
      if (c < 0) clash -= c;
      else complement += c;
      if (c > 0 && (!best || c > best.c)) best = { c, fa, fb };
    }
  }

  // Bridge: overlap in families, and notes both actually list.
  let bridge = 0;
  for (const [f, pa] of Object.entries(a.profile)) bridge += Math.min(pa, b.profile[f] ?? 0);
  const notesB = new Set(Object.values(b.notesBy).flat().map(x => x.note));
  const sharedNotes = [...new Set(Object.values(a.notesBy).flat().map(x => x.note))].filter(n => notesB.has(n) && !GENERIC_NOTE.test(n));

  const similarity = cosine(a.profile, b.profile);
  const [ha, hb] = [heaviness(frag.accords), heaviness(other.accords)];
  const sweetA = SWEET.reduce((s, f) => s + (a.profile[f] ?? 0), 0);
  const sweetB = SWEET.reduce((s, f) => s + (b.profile[f] ?? 0), 0);

  // Across the demo and catalog, complement runs about 0.19 (10th percentile) to 0.38 (90th).
  const complementScore = clamp((complement - COMPLEMENT_FLOOR) / COMPLEMENT_SPAN, 0, 1);
  const bridgeScore = bridge < 0.15 ? bridge / 0.15 : bridge <= 0.45 ? 1 : clamp(1 - (bridge - 0.45) / 0.4, 0, 1);
  const contrastScore = clamp(Math.abs(ha - hb) / 0.4, 0, 1);
  const tooAlike = similarity > 0.85;
  const bothSweet = sweetA > 0.35 && sweetB > 0.35;
  const bothHeavy = ha > 0.55 && hb > 0.55;
  const score = clamp(
    0.5 * complementScore + 0.25 * bridgeScore + 0.25 * contrastScore
      - Math.min(0.3, clash * 4) - (tooAlike ? 0.25 : 0) - (bothSweet ? 0.12 : 0) - (bothHeavy ? 0.12 : 0),
    0, 1);

  const reasons = [];
  if (best) {
    const subject = nameFor(b, best.fb), object = nameFor(a, best.fa);
    const effect = EFFECT[best.fb] ?? 'balances';
    reasons.push({ text: `${subject[0].toUpperCase()}${subject.slice(1)} ${isPlural(subject) ? pluralVerb(effect) : effect} the ${object}`, tone: 'good' });
  }
  if (sharedNotes.length) {
    const named = sharedNotes.slice(0, 2).join(' and ');
    reasons.push({ text: `Shared ${named} ${sharedNotes.length === 1 ? 'ties' : 'tie'} them together`, tone: 'good' });
  } else if (bridge >= 0.15 && !tooAlike) {
    const [f] = Object.keys(a.profile).filter(x => b.profile[x]).sort((x, y) => Math.min(a.profile[y], b.profile[y]) - Math.min(a.profile[x], b.profile[x]));
    if (f) reasons.push({ text: `Both lean ${f}`, tone: 'good' });
  }
  if (!reasons.length && contrastScore > 0.5) reasons.push({ text: 'One richer, one lighter', tone: 'good' });
  if (tooAlike) reasons.push({ text: 'So alike it adds little', tone: 'bad' });
  if (bothSweet) reasons.push({ text: 'Both run sweet, so go light on one', tone: 'bad' });
  if (bothHeavy) reasons.push({ text: 'Two heavy scents, better for cold nights', tone: 'bad' });
  if (clash > 0.02) reasons.push({ text: 'Some notes fight each other', tone: 'bad' });

  // Heavier and longer-lasting goes on first; the lighter one sits on top.
  const first = ha >= hb ? frag : other;
  return { fragrance: other, score, reasons, first };
}

// Each bottle's average pairing score across the collection (scores are symmetric).
let meansFor = { key: '', means: new Map(), overall: 0 };
function pairingMeans(collection) {
  const key = collection.map(f => f.id).join(',');
  if (meansFor.key === key) return meansFor;
  const sums = new Map(collection.map(f => [f.id, 0]));
  for (let i = 0; i < collection.length; i++) {
    for (let j = i + 1; j < collection.length; j++) {
      const { score } = layerPair(collection[i], collection[j]);
      sums.set(collection[i].id, sums.get(collection[i].id) + score);
      sums.set(collection[j].id, sums.get(collection[j].id) + score);
    }
  }
  const n = Math.max(1, collection.length - 1);
  const means = new Map([...sums].map(([id, sum]) => [id, sum / n]));
  const overall = [...means.values()].reduce((a, b) => a + b, 0) / Math.max(1, means.size);
  meansFor = { key, means, overall };
  return meansFor;
}

/** The best partners for `frag` among `collection`, best first. */
export function layerPicks(frag, collection, limit = 3) {
  const { means, overall } = pairingMeans(collection);
  return collection
    .filter(f => f.id !== frag.id)
    .map(f => {
      const pair = layerPair(frag, f);
      const generalist = (means.get(f.id) ?? overall) - overall;
      return { ...pair, score: clamp(pair.score - GENERALIST_DAMPING * generalist, 0, 1) };
    })
    .filter(p => p.score >= MIN_SCORE)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
