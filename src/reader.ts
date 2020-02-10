import * as zlib from 'zlib';

export class BinaryReader {
  private currentOffset = 0;

  private constructor(private buffer: Buffer) {}

  static create(buff: Buffer): BinaryReader {
    return new BinaryReader(buff);
  }

  assertMagic(str: string): string {
    const magic = this.hex(str.length / 2);

    if (magic !== str) {
      console.error('Bad Magic', 'real', { magic }, 'expected', { str });
      throw new Error('Bad File Magic');
    }

    return magic;
  }

  hex(length: number): string {
    const ret = this.buffer.toString(
      'hex',
      this.currentOffset,
      this.currentOffset + length
    );

    this.currentOffset += length;

    return ret;
  }

  ascii(length: number): string {
    const ret = this.buffer.toString(
      'ascii',
      this.currentOffset,
      this.currentOffset + length
    );

    this.currentOffset += length;

    return ret;
  }

  utf8(length: number): string {
    const ret = this.buffer.toString(
      'utf8',
      this.currentOffset,
      this.currentOffset + length
    );

    this.currentOffset += length;

    return ret;
  }

  read(length?: number): Buffer {
    if (length === undefined) {
      return this.buffer;
    }

    const ret = this.buffer.slice(
      this.currentOffset,
      this.currentOffset + length
    );

    this.currentOffset += length;

    return ret;
  }

  u8() {
    const ret = this.buffer.readUInt8(this.currentOffset);
    this.currentOffset += 1;
    return ret;
  }

  u16() {
    const ret = this.buffer.readUInt16LE(this.currentOffset);
    this.currentOffset += 2;
    return ret;
  }

  u32() {
    const ret = this.buffer.readUInt32LE(this.currentOffset);
    this.currentOffset += 4;
    return ret;
  }

  u64() {
    const first = this.u32();
    const second = this.u32();

    return first + (second >> 32);
  }

  struct<T>(cb: (reader: BinaryReader) => Promise<T>): Promise<T> {
    return cb(this);
  }

  async inflate(size?: number): Promise<Buffer> {
    const buff = this.read(size);

    return new Promise((res, rej) =>
      zlib.inflate(buff, (err, result) => (err ? rej(err) : res(result)))
    );
  }
}
