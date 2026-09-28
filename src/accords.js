// Per-accord metadata.
// weight: how warm/heavy (+1) vs. fresh/light (-1) an accord wears. Drives the
//   weather modifier: heat and humidity punish heavy scents, cold rewards them.
// color: chip color, roughly following Fragrantica's accord palette.
export const ACCORDS = {
  vanilla:        { weight:  1.0, color: '#f3e2b3' },
  caramel:        { weight:  1.0, color: '#c98a3d' },
  chocolate:      { weight:  1.0, color: '#6b3f26' },
  cacao:          { weight:  0.9, color: '#7a4a2e' },
  honey:          { weight:  0.9, color: '#e3a62b' },
  oud:            { weight:  1.0, color: '#5a3a2a' },
  tobacco:        { weight:  1.0, color: '#8a5a33' },
  whiskey:        { weight:  0.9, color: '#b36b1f' },
  leather:        { weight:  0.9, color: '#6e4b3a' },
  amber:          { weight:  0.9, color: '#d9822b' },
  balsamic:       { weight:  0.9, color: '#a0663a' },
  cinnamon:       { weight:  0.9, color: '#b5542c' },
  'warm spicy':   { weight:  0.8, color: '#c4452f' },
  animalic:       { weight:  0.8, color: '#8b6f5a' },
  sweet:          { weight:  0.7, color: '#e27a9c' },
  lactonic:       { weight:  0.5, color: '#f1ead8' },
  'soft spicy':   { weight:  0.4, color: '#d77a5b' },
  woody:          { weight:  0.3, color: '#8a6446' },
  earthy:         { weight:  0.3, color: '#7b6a4f' },
  rose:           { weight:  0.2, color: '#e0607e' },
  powdery:        { weight:  0.2, color: '#e8d6e3' },
  coconut:        { weight:  0.2, color: '#f4efe4' },
  musky:          { weight:  0.1, color: '#cbbfd6' },
  iris:           { weight:  0.1, color: '#a99bd6' },
  'white floral': { weight:  0.1, color: '#f2f0e6' },
  floral:         { weight:  0.0, color: '#f09bb8' },
  violet:         { weight:  0.0, color: '#8f6bc4' },
  savory:         { weight:  0.0, color: '#b9a37e' },
  mossy:          { weight: -0.1, color: '#5f7a45' },
  fruity:         { weight: -0.2, color: '#f06a5a' },
  tropical:       { weight: -0.3, color: '#f5a623' },
  lavender:       { weight: -0.3, color: '#9b8fd9' },
  aromatic:       { weight: -0.4, color: '#4f9a82' },
  herbal:         { weight: -0.5, color: '#6c9a4a' },
  'fresh spicy':  { weight: -0.5, color: '#7cc36a' },
  green:          { weight: -0.8, color: '#3fae5a' },
  fresh:          { weight: -0.9, color: '#8fd6e8' },
  citrus:         { weight: -1.0, color: '#e5e84a' },
  aquatic:        { weight: -1.0, color: '#3fa7d6' },
  ozonic:         { weight: -1.0, color: '#9fd3ee' },
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
