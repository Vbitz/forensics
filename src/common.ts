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

export function toBitmap(data: Buffer): boolean[] {
  const ret: boolean[] = [];
  for (const char of data) {
    ret.push(
      ...char
        .toString(2) // Convert to binary.
        .padStart(8, '0') // Pad the value to 8 bits.
        .split('') // Convert into a 8 element array.
        .reverse() // Reverse so it starts with the LSB.
        .map(v => v === '1') // Convert to boolean.
    );
  }
  return ret;
}

function printValue(value: number): string {
  if (value >= 0x20 && value <= 0x7e) {
    return String.fromCharCode(value);
  } else {
    return '.';
  }
}

export function hexDump(buff: Buffer): string {
  let x = 0;

  let lineHex = '';
  let lineAscii = '';

  let ret = '';

  let offset = 0;

  for (const value of buff) {
    lineHex += value.toString(16).padStart(2, '0') + ' ';
    lineAscii += printValue(value);

    x += 1;

    if (x > 16) {
      ret += `${offset
        .toString(16)
        .padStart(8, '0')} | ${lineHex.trim()} | ${lineAscii}\n`;

      lineHex = '';
      lineAscii = '';

      x = 0;

      offset += 16;
    }
  }

  ret += `${offset.toString(16).padStart(8, '0')} | ${lineHex
    .trim()
    .padEnd(3 * 16 + 2, ' ')} | ${lineAscii}\n`;

  return ret;
}

export function stripZeros(s: string): string {
  return s.replace(/\0/g, '');
}
