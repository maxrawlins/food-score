export type NovaPrediction = {
  nova: 1 | 2 | 3 | 4;
  confidence: number; // 0..1
  label: string;
};

// Placeholder until model is wired in
export function predictNovaFromProduct(): NovaPrediction | null {
  return null;
}

export function novaLabel(nova: 1 | 2 | 3 | 4) {
  if (nova === 1) return "NOVA 1 · Minimally processed";
  if (nova === 2) return "NOVA 2 · Processed culinary ingredients";
  if (nova === 3) return "NOVA 3 · Processed foods";
  return "NOVA 4 · Ultra-processed";
}