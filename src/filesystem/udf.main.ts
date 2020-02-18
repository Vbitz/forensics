import { registryEntryPoint } from '../entryPoint';
import { DiskFile } from '../file.node';
import { UniversalDiskFormat } from './udf';

registryEntryPoint('udf', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const udf = await UniversalDiskFormat.open(file);

  return 0;
});
