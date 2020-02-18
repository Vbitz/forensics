import { registryEntryPoint } from '../entryPoint';
import { DiskFile } from '../file.node';
import { VMWareDiskFile } from '../container/vmdk';
import { MasterBootRecord } from '../container/mbr';
import { NTFS } from './ntfs';

registryEntryPoint('ntfs', async args => {
  const [fileName, ...rest] = args;

  console.log(new Date(), 'Starting');

  const diskFile = await DiskFile.open(fileName);

  console.log(new Date(), 'Disk File Opened');

  const vmdkFile = await VMWareDiskFile.open(diskFile);

  console.log(new Date(), 'VMDK Opened');

  const mbr = await MasterBootRecord.open(vmdkFile);

  console.log(new Date(), 'MBR Opened');

  const partition = mbr.partitions[1];

  const ntfs = await NTFS.open(partition);

  console.log(new Date(), 'NTFS Opened');

  const root = await ntfs.getRootEntry();

  console.log(root.getAttributeNames());

  console.log(await root.readDirectoryEntries());

  console.log(new Date(), 'Finished');

  return 0;
});
