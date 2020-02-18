import { File as ForFile } from './file';

export class BlobFile extends ForFile {
  private constructor(private file: File) {
    super();
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    const slice = this.file.slice(offset, offset + size);

    const buffer = await ((slice as unknown) as {
      arrayBuffer(): Promise<ArrayBuffer>;
    }).arrayBuffer();

    return Buffer.from(buffer);
  }

  static async create(file: File) {
    return new BlobFile(file);
  }
}
