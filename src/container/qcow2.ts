// From: https://github.com/qemu/qemu/blob/523a2a42c3abd65b503610b2a18cd7fc74c6c61e/docs/interop/qcow2.txt

import { DiskFile, File } from '../file';
import { BinaryReader } from '../reader';
import { toHex, swapEndian64 } from '../common';
import { promises } from 'fs';
import { registryEntryPoint } from '../entryPoint';

interface Level1TableEntry {
  flag: number;
  l2TableOffset: number;
  reserved: number;
}

export class QCow2Image extends File {
  static readonly clusterSize = 0x10000;
  static readonly sectorSize = 0x200;

  private l1Table: Level1TableEntry[] = [];

  private constructor(private file: File) {
    super();
  }

  static async open(file: File) {
    const newImage = new QCow2Image(file);

    await newImage.parse();

    return newImage;
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    const fileOffset = await this.translateDiskOffsetToFileOffset(offset);

    if (fileOffset === undefined) {
      return Buffer.alloc(size);
    }

    console.log(fileOffset);

    throw new Error('Method not implemented.');
  }

  private async readCluster(clusterIndex: number) {
    return this.file.readAbsolute(
      clusterIndex * QCow2Image.clusterSize,
      QCow2Image.clusterSize
    );
  }

  private async parse() {
    const headerCluster = BinaryReader.create(
      await this.readCluster(0)
    ).setBigEndian();

    const header = await headerCluster.struct(async reader => ({
      magic: reader.assertMagic(toHex('QFI') + 'fb'),
      version: reader.u32(),
      backingFileOffset: reader.u64(),
      backingFileSize: reader.u32(),
      clusterBits: reader.u32(),
      size: reader.u64(),
      cryptMethod: reader.u32(),
      l1Size: reader.u32(),
      l1TableOffset: reader.u64(),
      refCountTableOffset: reader.u64(),
      refCountTableClusters: reader.u32(),
      nbSnapshots: reader.u32(),
      snapshotsOffset: reader.u64(),
      incompatibleFeatures: reader.u64(),
      compatibleFeatures: reader.u64(),
      autoClearFeatures: reader.u64(),
      refCountOrder: reader.u32(),
      headerLength: reader.u32(),
    }));

    console.log('header', header);

    const l1TableCluster = BinaryReader.create(
      await this.file.readAbsolute(header.l1TableOffset, header.l1Size * 8)
    );

    for (let i = 0; i < header.l1Size; i++) {
      const l1TableEntryHex = `0x${l1TableCluster.hex(8)}`;
      const l1TableEntryLE = BigInt(l1TableEntryHex);
      const l1TableEntry = swapEndian64(l1TableEntryLE);

      // console.log(l1TableEntry);

      const L1E_OFFSET_MASK = swapEndian64(0x00fffffffffffe00n);

      const l2TableOffset = l1TableEntry & L1E_OFFSET_MASK;

      // console.log(l1TableEntryHex, l1TableEntryLE, l1TableEntry, l2TableOffset);

      const l1TableEntryObj: Level1TableEntry = {
        reserved: 0,
        l2TableOffset: Number(swapEndian64(l2TableOffset)),
        flag: 0,
      };

      console.log('l1TableEntryObj', l1TableEntryObj);

      this.l1Table.push(l1TableEntryObj);

      // console.log(l1TableEntry.l2TableOffset / this.clusterSize);
    }
  }

  private async translateDiskOffsetToFileOffset(
    offset: number
  ): Promise<number | undefined> {
    const l2Entries = QCow2Image.clusterSize / 8;

    const l2Index = (offset / QCow2Image.clusterSize) % l2Entries;
    const l1Index = offset / QCow2Image.clusterSize / l2Entries;

    const l2TableOffset = this.l1Table[l1Index].l2TableOffset;

    if (l2TableOffset === 0) {
      return undefined;
    }

    const l2Table = await this.readL2Table(l2TableOffset);
    const clusterOffset = l2Table[l2Index];

    return clusterOffset + (offset % QCow2Image.clusterSize);
  }

  private offsetToCluster(offset: number): number {
    if (offset % QCow2Image.clusterSize !== 0) {
      throw new Error('Offset is not aligned on a cluster boundary');
    }

    return Math.floor(offset / QCow2Image.clusterSize);
  }

  private async readL2Table(offset: number): Promise<number[]> {
    const clusterNumber = this.offsetToCluster(offset);

    const l2TableCluster = BinaryReader.create(
      await this.readCluster(clusterNumber)
    );

    await promises.writeFile('l2Cluster.bin', l2TableCluster.buffer);

    for (let i = 0; i < l2TableCluster.length / 8; i++) {
      const l2TableEntryHex = `0x${l2TableCluster.hex(8)}`;
      const l2TableEntryBE = BigInt(l2TableEntryHex);
      const l2TableEntryLE = swapEndian64(l2TableEntryBE);

      const compressedFlag = l2TableEntryLE & (1n << 62n);
      const refCountFlag = l2TableEntryLE & (1n << 63n);

      if (compressedFlag) {
        console.log('Compressed');
        throw new Error('Not Implemented');
      } else {
        console.log('Uncompressed');
        if (refCountFlag) {
          console.log('refCount');

          throw new Error('Not Implemented');
        } else {
          const L2E_OFFSET_MASK = 0x00fffffffffffe00n;

          const offset = l2TableEntryLE & L2E_OFFSET_MASK;

          console.log(offset);
        }
      }

      break;
    }

    return [];
  }
}

registryEntryPoint('qcow2', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const qCow2 = await QCow2Image.open(file);

  await qCow2.read(QCow2Image.sectorSize);

  return 0;
});
