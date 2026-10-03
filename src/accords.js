// Per-accord metadata.
// prior: how warm/heavy (+1) vs. fresh/light (-1) an accord wears, judged by hand.
// weight: the prior nudged toward how Fragrantica voters wear the bottles in
//   data/ (`npm run fit` refits it). Drives the weather modifier: heat and
//   humidity punish heavy scents, cold rewards them. A new accord starts with
//   weight equal to its prior.
// color: chip color, roughly following Fragrantica's accord palette.
export const ACCORDS = {
  vanilla:        { prior:  1.0, weight:  1.00, color: '#f3e2b3' },
  caramel:        { prior:  1.0, weight:  0.95, color: '#c98a3d' },
  chocolate:      { prior:  1.0, weight:  1.00, color: '#6b3f26' },
  cacao:          { prior:  0.9, weight:  0.85, color: '#7a4a2e' },
  coffee:         { prior:  0.9, weight:  0.90, color: '#5b3a29' },
  honey:          { prior:  0.9, weight:  1.00, color: '#e3a62b' },
  oud:            { prior:  1.0, weight:  0.80, color: '#5a3a2a' },
  tobacco:        { prior:  1.0, weight:  1.00, color: '#8a5a33' },
  whiskey:        { prior:  0.9, weight:  0.90, color: '#b36b1f' },
  rum:            { prior:  0.9, weight:  0.90, color: '#8f4a1f' },
  leather:        { prior:  0.9, weight:  0.90, color: '#6e4b3a' },
  smoky:          { prior:  0.7, weight:  0.65, color: '#6f6a66' },
  amber:          { prior:  0.9, weight:  0.60, color: '#d9822b' },
  balsamic:       { prior:  0.9, weight:  0.90, color: '#a0663a' },
  cinnamon:       { prior:  0.9, weight:  1.00, color: '#b5542c' },
  'warm spicy':   { prior:  0.8, weight:  1.00, color: '#c4452f' },
  animalic:       { prior:  0.8, weight:  1.00, color: '#8b6f5a' },
  sweet:          { prior:  0.7, weight:  0.25, color: '#e27a9c' },
  almond:         { prior:  0.6, weight:  0.60, color: '#e2c79c' },
  cherry:         { prior:  0.4, weight:  0.30, color: '#b0213a' },
  nutty:          { prior:  0.6, weight:  0.65, color: '#9c6b3f' },
  lactonic:       { prior:  0.5, weight:  0.10, color: '#f1ead8' },
  'soft spicy':   { prior:  0.4, weight:  0.55, color: '#d77a5b' },
  woody:          { prior:  0.3, weight:  0.55, color: '#8a6446' },
  earthy:         { prior:  0.3, weight:  0.40, color: '#7b6a4f' },
  patchouli:      { prior:  0.5, weight:  0.55, color: '#6b5a3a' },
  rose:           { prior:  0.2, weight:  0.10, color: '#e0607e' },
  powdery:        { prior:  0.2, weight:  0.05, color: '#e8d6e3' },
  coconut:        { prior:  0.2, weight: -0.55, color: '#f4efe4' },
  musky:          { prior:  0.1, weight: -0.25, color: '#cbbfd6' },
  iris:           { prior:  0.1, weight:  0.05, color: '#a99bd6' },
  'white floral': { prior:  0.1, weight:  0.05, color: '#f2f0e6' },
  tuberose:       { prior:  0.3, weight:  0.10, color: '#f4e6ef' },
  'yellow floral': { prior:  0.1, weight: -0.30, color: '#f2d24b' },
  floral:         { prior:  0.0, weight:  0.30, color: '#f09bb8' },
  violet:         { prior:  0.0, weight: -0.25, color: '#8f6bc4' },
  savory:         { prior:  0.0, weight: -0.15, color: '#b9a37e' },
  paper:          { prior:  0.0, weight:  0.05, color: '#d9d3c3' },
  aldehydic:      { prior:  0.0, weight:  0.05, color: '#dfe7f2' },
  mossy:          { prior: -0.1, weight:  0.00, color: '#5f7a45' },
  fruity:         { prior: -0.2, weight: -0.40, color: '#f06a5a' },
  metallic:       { prior: -0.3, weight: -0.30, color: '#a7adb5' },
  tropical:       { prior: -0.3, weight: -0.60, color: '#f5a623' },
  terpenic:       { prior: -0.3, weight: -0.40, color: '#7a9a3c' },
  lavender:       { prior: -0.3, weight:  0.00, color: '#9b8fd9' },
  soapy:          { prior: -0.2, weight: -0.30, color: '#e3eef4' },
  aromatic:       { prior: -0.4, weight:  0.05, color: '#4f9a82' },
  herbal:         { prior: -0.5, weight: -0.40, color: '#6c9a4a' },
  'fresh spicy':  { prior: -0.5, weight: -0.20, color: '#7cc36a' },
  salty:          { prior: -0.5, weight: -0.55, color: '#c9d6dc' },
  green:          { prior: -0.8, weight: -1.00, color: '#3fae5a' },
  fresh:          { prior: -0.9, weight: -0.90, color: '#8fd6e8' },
  citrus:         { prior: -1.0, weight: -1.00, color: '#e5e84a' },
  aquatic:        { prior: -1.0, weight: -0.95, color: '#3fa7d6' },
  marine:         { prior: -1.0, weight: -1.00, color: '#2f7fb8' },
  ozonic:         { prior: -1.0, weight: -0.85, color: '#9fd3ee' },
};

export function accordColor(name) {
  return ACCORDS[name]?.color ?? '#9aa0ad';
}

// Strength-weighted heaviness of a fragrance, -1 (fresh) .. +1 (heavy).
export function heaviness(accords) {
  let sum = 0, total = 0;
  for (const [name, strength] of Object.entries(accords)) {
    const meta = ACCORDS[name];
    if (!meta) continue;
    sum += strength * meta.weight;
    total += strength;
  }
  return total ? sum / total : 0;
}
