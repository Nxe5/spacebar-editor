/** Intentionally buggy file — eval suite 10-agent-fix. */

export function sumArray(values: number[]): number {
  let total = 0;
  // Bug 1: off-by-one — should be i < values.length
  for (let i = 0; i <= values.length; i++) {
    total += values[i];
  }
  return total;
}

export function isPositive(n: number): boolean {
  // Bug 2: wrong operator — should be n > 0
  return n >= 0;
}

export function greet(name: string) {
  // Bug 3: type error — missing return type, returns wrong type when empty
  if (!name) return null;
  return `Hello, ${name}`;
}

export function parseCount(raw: string): number {
  // Bug 4: uses undefined helper
  return toNumber(raw);
}

function toNumber(_s: string): number {
  return 0;
}
