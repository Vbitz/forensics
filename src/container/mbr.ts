import { File, DiskFile } from '../file';
import { VMWareDiskFile } from './vmdk';
import { BinaryReader } from '../reader';
import { promises } from 'fs';
import { registryEntryPoint } from '../entryPoint';

export class MBRPartition extends File {
  static async create(
    file: File,
    status: number,
    partitionType: number,
    firstSectorLBA: number,
    numberOfSectors: number
  ): Promise<MBRPartition> {
    return new MBRPartition(
      file,
      status,
      partitionType,
      firstSectorLBA,
      numberOfSectors
    );
  }

  private constructor(
    private file: File,
    readonly status: number,
    readonly partitionType: number,
    readonly firstSectorLBA: number,
    readonly numberOfSectors: number
  ) {
    super();
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    return this.file.readAbsolute(offset + this.firstSectorLBA * 512, size);
  }
}

export class MasterBootRecord {
  readonly partitions: MBRPartition[] = [];

  private constructor(private file: File) {}

  static async open(file: File) {
    const newMBR = new MasterBootRecord(file);

    await newMBR.parse();

    return newMBR;
  }

  private async parse() {
    const firstSector = BinaryReader.create(
      await this.file.readAbsolute(0, 512)
    );

    firstSector.seek(510);

    firstSector.assertMagic('55aa');

    firstSector.seek(446);

    for (let i = 0; i < 4; i++) {
      const partitionEntry = await firstSector.struct(async reader => ({
        status: reader.u8(),
        firstSectorCHS: reader.read(3),
        partitionType: reader.u8(),
        lastSectorCHS: reader.read(3),
        firstSectorLBA: reader.u32(),
        numberOfSectors: reader.u32(),
      }));

      if (partitionEntry.numberOfSectors > 0) {
        this.partitions.push(
          await MBRPartition.create(
            this.file,
            partitionEntry.status,
            partitionEntry.partitionType,
            partitionEntry.firstSectorLBA,
            partitionEntry.numberOfSectors
          )
        );
      }
    }
  }
}

registryEntryPoint('mbr', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const vmdk = await VMWareDiskFile.open(file);

  const mbr = await MasterBootRecord.open(vmdk);

  const firstSector = await mbr.partitions[1].read(512);

  await promises.writeFile('firstSector.bin', firstSector);

  return 0;
});
