export type EntryPoint = (args: string[]) => Promise<number>;

const entryPoints = new Map<string, EntryPoint>();

export function registryEntryPoint(name: string, entryPoint: EntryPoint) {
  entryPoints.set(name, entryPoint);
}

export async function callEntryPoint(
  name: string,
  ...rest: string[]
): Promise<number> {
  const entryPoint = entryPoints.get(name);

  if (entryPoint === undefined) {
    throw new Error('Unknown EntryPoint');
  }

  return entryPoint(rest);
}
