import 'source-map-support/register';

import './container/ewfFile';
import './container/mbr';
import './container/qcow2';
import './container/vmdk';

import './filesystem/ntfs';
import './filesystem/udf';

import { callEntryPoint } from './entryPoint';

async function main(args: string[]): Promise<number> {
  const [entryPoint, ...rest] = args;

  return callEntryPoint(entryPoint, ...rest);
}

main(process.argv.slice(2))
  .then(exitCode => (process.exitCode = exitCode))
  .catch(err => {
    console.error('Fatal', err);
    process.exit(1);
  });
