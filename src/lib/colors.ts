export const COLORS = [
  { color: '#2563C9', label: '青' },
  { color: '#B8551C', label: 'オレンジ' },
  { color: '#1A7F50', label: '緑' },
  { color: '#7F49C0', label: '紫' },
  { color: '#B5306B', label: 'ピンク' },
  { color: '#4A5260', label: 'グレー' },
] as const;

/** まだ誰も使っていない色を優先して返す */
export function suggestColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  return (COLORS.find((c) => !used.has(c.color)) ?? COLORS[usedColors.length % COLORS.length]).color;
}
