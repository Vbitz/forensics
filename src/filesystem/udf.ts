import { File } from '../file';

export class UniversalDiskFormat {
  private constructor(private file: File) {}

  static async open(file: File) {
    const udf = new UniversalDiskFormat(file);

    await udf.parse();

    return udf;
  }

  private async parse() {}
}
