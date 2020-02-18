export abstract class File {
  private currentOffset = 0;

  abstract readAbsolute(offset: number, size: number): Promise<Buffer>;

  tell(): number {
    return this.currentOffset;
  }

  seek(offset: number): void {
    this.currentOffset = offset;
  }

  read(size: number): Promise<Buffer> {
    const buf = this.readAbsolute(this.currentOffset, size);

    this.currentOffset += size;

    return buf;
  }
}

export class MemoryFile extends File {
  private constructor(private buffer: Buffer) {
    super();
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    return this.buffer.slice(offset, offset + size);
  }

  static async openMemory(buffer: Buffer): Promise<MemoryFile> {
    return new MemoryFile(buffer);
  }
}
