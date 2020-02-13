import 'source-map-support/register';

import { ewfFileMain } from './container/ewfFile';
import { ntfsMain } from './filesystem/ntfs';
import { qCow2Main } from './container/qcow2';
import { vmdkMain } from './container/vmdk';
import { mbrMain } from './container/mbr';

async function main(args: string[]): Promise<number> {
  const [entryPoint, ...rest] = args;

  if (entryPoint === 'ewf') {
    return ewfFileMain(rest);
  } else if (entryPoint === 'ntfs') {
    return ntfsMain(rest);
  } else if (entryPoint === 'qcow2') {
    return qCow2Main(rest);
  } else if (entryPoint === 'vmdk') {
    return vmdkMain(rest);
  } else if (entryPoint === 'mbr') {
    return mbrMain(rest);
  } else {
    console.error('Invalid EntryPoint');
    return 1;
  }
}

main(process.argv.slice(2))
  .then(exitCode => (process.exitCode = exitCode))
  .catch(err => {
    console.error('Fatal', err);
    process.exit(1);
  });
