// From: https://www.vmware.com/support/developer/vddk/vmdk_50_technote.pdf

import { File, DiskFile } from '../file';
import { BinaryReader } from '../reader';
import { toHex, expect } from '../common';
import { promises } from 'fs';
import { registryEntryPoint } from '../entryPoint';

interface Extent {
  type: 'RW';
  size: number;
  kind: 'SPARSE';
  fileName: string;
}

export class VMWareDiskFile extends File {
  private readonly sectorSize = 512;

  private version = 0;
  private capacity = 0;
  private grainSize = 0;
  private numGTEsPerGT = 0;
  private gdOffset = 0;
  private overHead = 0;
  private gtCoverage = 0;

  private ddb: Record<string, string> = {};

  private extents: Extent[] = [];

  private grainDirectory: number[] | undefined = undefined;

  private lastGrainDirectoryEntry = -1;
  private lastGrainTable: number[] | undefined = undefined;

  private constructor(private file: File) {
    super();
  }

  static async open(file: File) {
    const newImage = new VMWareDiskFile(file);

    await newImage.parse();

    return newImage;
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    // console.log('VMDKRead', offset, size);
    const sector = Math.floor(offset / this.sectorSize);

    const sectorOffset = offset % this.sectorSize;

    if (sectorOffset + size > this.sectorSize) {
      // Determine how many sectors are spanned.

      if (sectorOffset === 0 && size % this.sectorSize === 0) {
        const sectorCount = size / this.sectorSize;
        const ret: Buffer[] = [];

        for (let i = sector; i < sector + sectorCount; i++) {
          ret.push(await this.readImageSector(i));
        }

        return Buffer.concat(ret);
      } else {
        throw new Error('Unaligned cross sector reads not implemented');
      }
    } else {
      const sectorData = await this.readImageSector(sector);

      return sectorData.slice(sectorOffset, sectorOffset + size);
    }
  }

  async readImageSector(sector: number): Promise<Buffer> {
    const grainTableEntry = await this.getGrainTableEntryForSector(sector);

    if (grainTableEntry === 0) {
      return Buffer.alloc(this.sectorSize);
    }

    const grainOffset = sector % this.grainSize;

    const sectorData = await this.readSectors(grainTableEntry + grainOffset, 1);

    return sectorData;
  }

  async readSectors(offset: number, count = 1): Promise<Buffer> {
    if (count === 1) {
      return this.file.readAbsolute(offset * this.sectorSize, this.sectorSize);
    } else {
      const ret: Buffer[] = [];

      for (let i = offset; i < offset + count; i++) {
        ret.push(await this.readSectors(i));
      }

      return Buffer.concat(ret);
    }
  }

  private async getGrainTableEntryForSector(sector: number): Promise<number> {
    if (this.grainDirectory === undefined) {
      const gtCoverage = this.numGTEsPerGT * this.grainSize;

      this.gtCoverage = gtCoverage;

      const grainDirectorySectors = gtCoverage / this.sectorSize;

      const grainDirectoryReader = BinaryReader.create(
        await this.readSectors(this.gdOffset, grainDirectorySectors)
      );

      const grainDirectory: number[] = [];

      for (let i = 0; i < grainDirectoryReader.length / 4; i++) {
        grainDirectory.push(grainDirectoryReader.u32());
      }

      this.grainDirectory = grainDirectory;
    }

    const grainDirectoryEntryIndex = Math.floor(sector / this.gtCoverage);

    const grainDirectoryEntry = this.grainDirectory[grainDirectoryEntryIndex];

    const grainTableIndex = Math.floor(
      (sector % this.gtCoverage) / this.grainSize
    );

    if (grainDirectoryEntry !== this.lastGrainDirectoryEntry) {
      const grainTableReader = BinaryReader.create(
        await this.readSectors(grainDirectoryEntry, 4)
      );

      const grainTable: number[] = [];

      for (let i = 0; i < grainTableReader.length / 4; i++) {
        grainTable.push(grainTableReader.u32());
      }

      this.lastGrainTable = grainTable;
      this.lastGrainDirectoryEntry = grainDirectoryEntry;
    }

    if (this.lastGrainTable === undefined) {
      throw new Error('Not Implemented');
    }

    const grainTableEntry = this.lastGrainTable[grainTableIndex];

    return grainTableEntry;
  }

  private async parse() {
    const headerReader = BinaryReader.create(await this.readSectors(0));

    const header = await headerReader.struct(async reader => ({
      magicNumber: reader.assertMagic(toHex('KDMV')), // VMDK reversed
      version: reader.u32(),
      flags: reader.u32(),
      capacity: reader.u64(),
      grainSize: reader.u64(),
      descriptorOffset: reader.u64(),
      descriptorSize: reader.u64(),
      numGTEsPerGT: reader.u32(),
      rgdOffset: reader.u64(),
      gdOffset: reader.u64(),
      overHead: reader.u64(),
      uncleanShutdown: reader.u8(),
      singleEndLineChar: reader.ascii(1),
      nonEndLineChar: reader.ascii(1),
      doubleEndLineChar1: reader.ascii(1),
      doubleEndLineChar2: reader.ascii(1),
      compressAlgorithm: reader.u16(),
      pad: reader.read(433),
    }));

    // Copy the header fields into the class instance.
    this.capacity = header.capacity;
    this.grainSize = header.grainSize;
    this.numGTEsPerGT = header.numGTEsPerGT;
    this.gdOffset = header.gdOffset;
    this.overHead = header.overHead;

    const embeddedDescriptorBuffer = await this.readSectors(
      header.descriptorOffset,
      header.descriptorSize
    );

    const embeddedDescriptorStr = embeddedDescriptorBuffer
      .toString('utf8')
      .replace(/\0/g, '');

    await this.parseEmbeddedDescriptor(embeddedDescriptorStr);
  }

  private async parseEmbeddedDescriptor(descriptorFile: string) {
    const lines = descriptorFile.split('\n');

    for (const line of lines) {
      if (line.startsWith('#')) {
        // Comment
        continue;
      }

      if (line.trim().length === 0) {
        // Empty
        continue;
      }

      if (line.startsWith('version')) {
        if (line !== 'version=1') {
          throw new Error('Not Implemented');
        }

        this.version = 1;
      } else if (line.startsWith('CID')) {
      } else if (line.startsWith('parentCID')) {
      } else if (line.startsWith('createType')) {
      } else if (line.startsWith('RW ')) {
        const [_, sizeStr, fileNameStr] =
          /RW ([0-9]+) SPARSE "(.*)"/.exec(line) ||
          expect('Match for RW failed');

        const size = Number.parseInt(sizeStr, 10);

        const fileName = JSON.parse(`"${fileNameStr}"`);

        this.extents.push({ type: 'RW', size, kind: 'SPARSE', fileName });
      } else if (line.startsWith('ddb.')) {
        const [name, rawValue] = line.split(' = ');

        const value = JSON.parse(rawValue);

        this.ddb[name] = value;
      } else {
        console.warn('Unknown', line);
      }
    }
  }
}

registryEntryPoint('vmdk', async args => {
  const [fileName, ...rest] = args;

  const file = await DiskFile.open(fileName);

  const vmdk = await VMWareDiskFile.open(file);

  const firstSector = await vmdk.read(512);

  await promises.writeFile('firstSector.bin', firstSector);

  return 0;
});
