export function hexString(...parts: string[]) {
  return parts.join('');
}

export function zipObject<V>(keys: string[], values: V[]): Record<string, V> {
  const ret: Record<string, V> = {};

  for (let i = 0; i < keys.length; i++) {
    ret[keys[i]] = values[i];
  }

  return ret;
}
