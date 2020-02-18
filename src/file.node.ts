import { promises } from 'fs';
import { File, MemoryFile } from './file';

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

export async function openMemoryFile(fileName: string): Promise<MemoryFile> {
  const content = await promises.readFile(fileName);

  return MemoryFile.openMemory(content);
}
