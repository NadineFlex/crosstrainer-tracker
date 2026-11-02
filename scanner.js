// Vorsichtige regelbasierte Zuordnung erkannter OCR-Zeilen.
// Es werden keine Zahlen geraten; nicht zuordenbare Werte bleiben leer.
const fields = [
  ['duration', /(?:TIME|ZEIT|DAUER|DURATION)/i],
  ['calories', /(?:CALORIES|CALORIE|KCAL|KALORIEN|CAL\b)/i],
  ['distance', /(?:DISTANCE|DISTANZ|KM\b)/i],
  ['avgHeartRate', /(?:HEART\s*RATE|PULSE|PULS|BPM)/i],
  ['avgWatts', /(?:AVG\s*WATT|AVERAGE\s*WATT|WATT|POWER)/i],
  ['avgSpeed', /(?:SPEED|GESCHW)/i],
  ['resistance', /(?:RESISTANCE|WIDERSTAND|LEVEL)/i],
  ['avgUPM', /(?:RPM|UPM)/i],
  ['avgMets', /(?:METS?\b)/i],
];
export function parseDisplayText(text) {
  const result = {};
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const matching = fields.filter(([, re]) => re.test(line));
    if (matching.length !== 1) continue;
    const [key, re] = matching[0];
    const tail = line.slice(line.search(re)).replace(re, '').replace(/^\s*(?:[:=\-]|TOTAL|AVG|AVERAGE|Ø)\s*/i, '');
    const match = key === 'duration' ? tail.match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/) : tail.match(/\b\d+(?:[.,]\d+)?\b/);
    if (!match) continue;
    const value = key === 'duration' ? match[0] : Number(match[0].replace(',', '.'));
    if (key !== 'duration' && (!Number.isFinite(value) || value < 0)) continue;
    result[key] = value;
  }
  return result;
}
