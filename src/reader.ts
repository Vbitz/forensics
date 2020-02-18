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

  u32() {
    const ret = this.bigEndian
      ? this.buffer.readUInt32BE(this.currentOffset)
      : this.buffer.readUInt32LE(this.currentOffset);

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
    } else if (size === 4) {
      return this.u32();
    } else if (size === 8) {
      return this.u64();
    } else {
      throw new Error('Not Implemented');
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
