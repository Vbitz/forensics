import { promises } from 'fs';

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

  static async open(fileName: string): Promise<MemoryFile> {
    const content = await promises.readFile(fileName);

    return new MemoryFile(content);
  }

  static async openMemory(buffer: Buffer): Promise<MemoryFile> {
    return new MemoryFile(buffer);
  }
}

export class DiskFile extends File {
  private constructor(private fileHandle: promises.FileHandle) {
    super();
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    const buff = Buffer.alloc(size);

    const { buffer, bytesRead } = await this.fileHandle.read(
      buff,
      0,
      size,
      offset
    );

    if (bytesRead !== size) {
      throw new Error(
        `Bad Read: offset=${offset} size=${size} bytesRead=${bytesRead}`
      );
    }

    return buffer;
  }

  static async open(fileName: string): Promise<DiskFile> {
    const newHandle = await promises.open(fileName, 'r');

    return new DiskFile(newHandle);
  }
}
