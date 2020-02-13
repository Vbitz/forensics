import { registryEntryPoint } from '../entryPoint';
import { DiskFile, File } from '../file';

export class UniversalDiskFormat {
  private constructor(private file: File) {}

  static async open(file: File) {
    const udf = new UniversalDiskFormat(file);

    await udf.parse();

    return udf;
  }

  private async parse() {}
}

registryEntryPoint('udf', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const udf = await UniversalDiskFormat.open(file);

  return 0;
});
