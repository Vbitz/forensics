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

export function toHex(str: string) {
  return Buffer.alloc(str.length, str, 'utf8').toString('hex');
}

export function expect(message: string): never {
  throw new Error('Expect: ' + message);
}

// From: https://en.wikipedia.org/wiki/Endianness#Byte_swap
export function swapEndian32(value: bigint) {
  let result = 0n;
  result |= (value & 0x000000ffn) << 24n;
  result |= (value & 0x0000ff00n) << 8n;
  result |= (value & 0x00ff0000n) >> 8n;
  result |= (value & 0xff000000n) >> 24n;
  return result;
}

export function swapEndian64(value: bigint): bigint {
  return (
    (swapEndian32(value & 0xffffffffn) << 32n) | swapEndian32(value >> 32n)
  );
}
