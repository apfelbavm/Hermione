/** The first "{prefix}_N" (N starting at 1) not already present among existingNames — used to
 * seed a freshly-created variable/function/input/output with an unused default name, so the user
 * never has to fill in a name before clicking "+". */
export function nextAvailableName(existingNames: Iterable<string>, prefix: string): string {
  const taken = new Set(existingNames);
  let i = 1;
  while (taken.has(`${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}
