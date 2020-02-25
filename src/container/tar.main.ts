import { registryEntryPoint } from '../entryPoint';
import { DiskFile } from '../file.node';
import { TarArchive } from './tar';
import { VMWareDiskFile } from './vmdk';
import { promises } from 'fs';

registryEntryPoint('tar', async args => {
  const [fileName, rest] = args;

  const file = await DiskFile.open(fileName);

  const tar = await TarArchive.open(file);

  const vmdkTarFile = (() => {
    for (const file of tar.files) {
      if (file.fileName.endsWith('.vmdk')) {
        return file;
      }
    }
    return undefined;
  })();

  if (vmdkTarFile === undefined) {
    throw new Error('Not Implemented');
  }

  const vmdk = await VMWareDiskFile.open(vmdkTarFile);

  await promises.writeFile('firstSector.bin', await vmdk.readAbsolute(0, 4096));

  return 0;
});
