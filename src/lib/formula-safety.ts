export function unsafeFormula(value: string): boolean {
  if (!value.trimStart().startsWith('=')) return false;
  return /\b(?:WEBSERVICE|HYPERLINK|RTD|CALL|REGISTER\.ID)\s*\(|\[[^\]]+\][^!]*!|\|[^!]+!/i.test(value);
}
export function hasUnsafeFormula(value: unknown): boolean {
  if (typeof value === 'string') return unsafeFormula(value);
  if (Array.isArray(value)) return value.some(hasUnsafeFormula);
  if (value && typeof value === 'object') return Object.values(value).some(hasUnsafeFormula);
  return false;
}
