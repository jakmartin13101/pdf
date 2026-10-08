let counter = 0;

export function uid(prefix = ''): string {
  counter = (counter + 1) % 0x7fffffff;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
