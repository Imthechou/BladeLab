export const XP_THRESHOLDS = [0, 80, 220, 450, 800, 1250, 1850, 2600, 3500, 4600];

// Discount, fracture-risk reduction and rare-ore chance bonus (percentage points).
const PERKS = [
  [0, 0, 0], [.05, 0, 0], [.05, 0, 2], [.05, .04, 2], [.10, .04, 2],
  [.10, .04, 4], [.10, .08, 4], [.15, .08, 4], [.15, .08, 6], [.15, .10, 6],
];

export function workshopPerks(level) {
  const [discount, riskReduction, rareBonus] = PERKS[level - 1] ?? PERKS[0];
  return { discount, riskReduction, rareBonus };
}

export function workshopStatus(save) {
  const xp = Math.max(0, Number(save.count) || 0) * 10 + Math.max(0, Number(save.tournament?.xp) || 0);
  const index = XP_THRESHOLDS.findLastIndex(threshold => xp >= threshold);
  return { level: index + 1, xp, floor: XP_THRESHOLDS[index], next: XP_THRESHOLDS[index + 1] };
}
