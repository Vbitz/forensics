import { ewfFileMain } from './ewfFile';
import { ntfsMain } from './ntfs';

async function main(args: string[]): Promise<number> {
  const [entryPoint, ...rest] = args;

  if (entryPoint === 'ewf') {
    return ewfFileMain(rest);
  } else if (entryPoint === 'ntfs') {
    return ntfsMain(rest);
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
