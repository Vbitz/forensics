import * as zlib from 'zlib';

export class BinaryReader {
  private currentOffset = 0;
  private bigEndian = false;

  private constructor(readonly buffer: Buffer) {}

  get length() {
    return this.buffer.length;
  }

  static create(buff: Buffer): BinaryReader {
    return new BinaryReader(buff);
  }

  setBigEndian(): this {
    this.bigEndian = true;

    return this;
  }

  seek(offset: number) {
    this.currentOffset = offset;

    if (this.currentOffset > this.buffer.length) {
      throw new Error('Seek to outside buffer');
    }
  }

  async seekTemp<T>(
    offset: number,
    cb: (reader: BinaryReader) => Promise<T>
  ): Promise<T> {
    return this.peek(async reader => {
      this.seek(offset);
      return cb(reader);
    });
  }

  async peek<T>(cb: (reader: BinaryReader) => Promise<T>): Promise<T> {
    const lastOffset = this.tell();

    const ret = await cb(this);

    this.seek(lastOffset);

    return ret;
  }

  tell(): number {
    return this.currentOffset;
  }

  assertMagic(str: string): string {
    const magic = this.hex(str.length / 2);

    if (magic !== str) {
      console.error('Bad Magic', 'real', { magic }, 'expected', { str });
      throw new Error('Bad Magic Number');
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

  utf16le(length: number): string {
    const ret = this.buffer.toString(
      'utf16le',
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

  s8() {
    const ret = this.buffer.readInt8(this.currentOffset);

    this.currentOffset += 1;

    return ret;
  }

  u16() {
    const ret = this.bigEndian
      ? this.buffer.readUInt16BE(this.currentOffset)
      : this.buffer.readUInt16LE(this.currentOffset);

    this.currentOffset += 2;

    return ret;
  }

  s16() {
    const ret = this.bigEndian
      ? this.buffer.readInt16BE(this.currentOffset)
      : this.buffer.readInt16LE(this.currentOffset);

    this.currentOffset += 2;

    return ret;
  }

  u32() {
    const ret = this.bigEndian
      ? this.buffer.readUInt32BE(this.currentOffset)
      : this.buffer.readUInt32LE(this.currentOffset);

    this.currentOffset += 4;

    return ret;
  }

  s32() {
    const ret = this.bigEndian
      ? this.buffer.readInt32BE(this.currentOffset)
      : this.buffer.readInt32LE(this.currentOffset);

    this.currentOffset += 4;

    return ret;
  }

  u64() {
    const first = this.u32();
    const second = this.u32();

    if (this.bigEndian) {
      return second + first * 0xffffffff;
    } else {
      return first + second * 0xffffffff;
    }
  }

  varUInt(size: number): number {
    if (size === 1) {
      return this.u8();
    } else if (size === 2) {
      return this.u16();
    } else if (size === 3) {
      if (this.bigEndian) {
        return Buffer.concat([new Uint8Array(1), this.read(3)]).readUInt32BE(0);
      } else {
        return Buffer.concat([this.read(3), new Uint8Array(1)]).readUInt32LE(0);
      }
    } else if (size === 4) {
      return this.u32();
    } else if (size === 8) {
      return this.u64();
    } else {
      throw new Error('Not Implemented: ' + size);
    }
  }

  varInt(size: number): number {
    if (size === 1) {
      return this.s8();
    } else if (size === 2) {
      return this.s16();
    } else if (size === 3) {
      if (this.bigEndian) {
        return Buffer.concat([new Uint8Array(1), this.read(3)]).readInt32BE(0);
      } else {
        return Buffer.concat([this.read(3), new Uint8Array(1)]).readInt32LE(0);
      }
    } else if (size === 4) {
      return this.s32();
    } else {
      throw new Error('Not Implemented: ' + size);
    }
  }

  struct<T>(cb: (reader: BinaryReader) => Promise<T>): Promise<T> {
    return cb(this);
  }

  static makeStructure<T>(
    cb: (reader: BinaryReader) => Promise<T>
  ): (reader: BinaryReader) => Promise<T> {
    return reader => reader.struct(cb);
  }

  async inflate(size?: number): Promise<Buffer> {
    const buff = this.read(size);

    return new Promise((res, rej) =>
      zlib.inflate(buff, (err, result) => (err ? rej(err) : res(result)))
    );
  }
}
