export const N_POSTES = 22;
export const TOTAL_TOLERANCE = 10;

// Index JS: 0 = Index 1, 1 = Index 2, etc.
// Structure du compteur: 1-4, 5-8, 9-12, 13, 14-16, 17-19, 20-22.
export const TOTAL_GROUPS = [
  { parts: [0, 1, 2], total: 3, label: "1 + 2 + 3 → 4" },
  { parts: [4, 5, 6], total: 7, label: "5 + 6 + 7 → 8" },
  { parts: [8, 9, 10], total: 11, label: "9 + 10 + 11 → 12" },
  { parts: [16, 17, 18], total: 12, label: "17 + 18 + 19 → 13" },
  { parts: [19, 20, 21], total: 11, label: "20 + 21 + 22 → 12" },
];

const num = v => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function isLowerIndex(oldValue, newValue, index) {
  // Exception demandée: Index 14, 15 et 16 ne déclenchent pas l'alerte.
  if ([13, 14, 15].includes(index)) return false;
  const oldN = num(oldValue);
  const newN = num(newValue);
  return oldN !== null && newN !== null && newN < oldN;
}

export function totalIssues(values) {
  const issues = [];
  for (const g of TOTAL_GROUPS) {
    const parts = g.parts.map(i => num(values?.[i]));
    const total = num(values?.[g.total]);
    if (parts.every(v => v !== null) && total !== null) {
      const sum = parts.reduce((a, b) => a + b, 0);
      const diff = Math.abs(sum - total);
      if (diff > TOTAL_TOLERANCE) issues.push({ ...g, sum, totalValue: total, diff });
    }
  }
  return issues;
}

export function lowerIndexes(oldValues, values) {
  return values.map((v, i) => isLowerIndex(oldValues?.[i], v, i) ? i : -1).filter(i => i >= 0);
}
