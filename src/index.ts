import { ewfFileMain } from './ewfFile';

async function main(args: string[]): Promise<number> {
  const [entryPoint, ...rest] = args;

  if (entryPoint !== 'ewf') {
    console.error('Invalid EntryPoint');
    return 1;
  }

  return ewfFileMain(rest);
}

main(process.argv.slice(2))
  .then(exitCode => (process.exitCode = exitCode))
  .catch(err => {
    console.error('Fatal', err);
    process.exit(1);
  });
