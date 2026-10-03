/** Human output keeps type-significant strings and empty containers distinguishable. */
export default function renderConfigValue(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value);
  if (
    !value ||
    value.trim() !== value ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32) ||
    /^(?:true|false|null|-?\d)|^[[{"]/.test(value)
  )
    return JSON.stringify(value);
  return value;
}
