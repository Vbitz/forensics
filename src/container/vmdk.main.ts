import { registryEntryPoint } from '../entryPoint';
import { DiskFile } from '../file.node';
import { VMWareDiskFile } from './vmdk';
import { promises } from 'fs';

registryEntryPoint('vmdk', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const vmdk = await VMWareDiskFile.open(file);

  const firstSector = await vmdk.read(512);

  await promises.writeFile('firstSector.bin', firstSector);

  return 0;
});
