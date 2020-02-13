// Documentation from: https://github.com/libyal/libewf/blob/master/documentation/Expert%20Witness%20Compression%20Format%20%28EWF%29.asciidoc#compression

import { File, MemoryFile } from '../file';
import { hexString, zipObject } from '../common';
import { BinaryReader } from '../reader';
import { promises } from 'fs';
import { registryEntryPoint } from '../entryPoint';

const EWF_MAGIC = hexString('45', '56', '46', '09', '0d', '0a', 'ff', '00');

interface ChunkTableEntry {
  offset: number;
  compressed: boolean;
}

export class EWFFile extends File {
  private tableEntries: ChunkTableEntry[] = [];
  private chunkSize = 0;

  private constructor(private file: File) {
    super();
  }

  static async open(file: File): Promise<EWFFile> {
    const newFile = new EWFFile(file);

    await newFile.parse();

    return newFile;
  }

  get numberOfChunks() {
    return this.tableEntries.length;
  }

  async readChunk(index: number): Promise<Buffer> {
    const entry = this.tableEntries[index];

    if (entry === undefined) {
      throw new Error('Not Implemented');
    }

    const compressedData = await this.file.readAbsolute(
      entry.offset,
      this.chunkSize
    );

    const decompressedData = await BinaryReader.create(
      compressedData
    ).inflate();

    return decompressedData;
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    const chunkNumber = Math.floor(offset / this.chunkSize);

    const chunkOffset = offset % this.chunkSize;

    if (chunkOffset + size > this.chunkSize) {
      throw new Error('Cross chunk reads not implemented');
    }

    const chunk = await this.readChunk(chunkNumber);

    return chunk.slice(chunkOffset, chunkOffset + size);
  }

  private async parse() {
    const segmentHeader = await this.readSegmentHeader();

    const header2 = await this.readHeader2();
    const header2Dupe = await this.readHeader2();

    const header = await this.readHeader();

    const volume = await this.readVolumeHeader();

    const sectorsSection = await this.readSectionDescriptor();

    // console.log('sectors', sectorsSection);

    if (sectorsSection.type !== 'sectors') {
      throw new Error('Not Implemented');
    }

    this.chunkSize = volume.sectorsPerChunk * volume.bytesPerSector;

    this.file.seek(sectorsSection.nextSectionOffset);

    const tableSection = await this.readSectionDescriptor();

    if (tableSection.type !== 'table') {
      throw new Error('Not Implemented');
    }

    const tableData = BinaryReader.create(
      await this.file.read(tableSection.sectionSize)
    );

    const tableHeader = await tableData.struct(async reader => ({
      numberOfEntries: reader.u32(),
      padding1: reader.read(4),
      tableBaseOffset: reader.u64(),
      padding2: reader.read(4),
      checksum: reader.u32(),
    }));

    for (let i = 0; i < tableHeader.numberOfEntries; i++) {
      const msb = Math.pow(2, 31);
      const value = tableData.u32();
      const offset = value ^ msb;

      this.tableEntries.push({
        compressed: (value & msb) !== 0,
        offset: offset + tableHeader.tableBaseOffset,
      });
    }

    // console.log(tableSection, tableHeader, tableEntries);
  }

  private async readSegmentHeader() {
    return BinaryReader.create(await this.file.read(13)).struct(
      async reader => ({
        magic: reader.assertMagic(EWF_MAGIC),
        startOfFields: reader.u8(),
        segmentNumber: reader.u16(),
        endOFFields: reader.u16(),
      })
    );
  }

  private async readSectionDescriptor() {
    return BinaryReader.create(await this.file.read(76)).struct(
      async reader => ({
        type: reader.ascii(16).replace(/\0/g, ''),
        nextSectionOffset: reader.u64(),
        sectionSize: reader.u64(),
        padding: reader.read(40),
        checksum: reader.u32(),
      })
    );
  }

  private async readHeader2() {
    const headerSection = await this.readSectionDescriptor();

    if (headerSection.type !== 'header2') {
      throw new Error('Not Implemented');
    }

    const headerSectionData = await this.file.read(headerSection.sectionSize);

    const headerSectionDataInflated = await BinaryReader.create(
      headerSectionData
    ).inflate();

    if (headerSectionDataInflated.readUInt16BE(0) !== 0xfffe) {
      throw new Error('Not Implemented');
    }

    const lines = headerSectionDataInflated.toString('utf16le').split('\n');

    const headerData = this.parseHeader2Data(lines);

    this.file.seek(headerSection.nextSectionOffset);

    return headerData;
  }

  private parseHeader2Data(lines: string[]) {
    if (lines.length !== 18) {
      throw new Error('Not Implemented');
    }

    const categoryCount = Number.parseInt(lines[0], 10);

    if (categoryCount !== 3) {
      throw new Error('Not Implemented');
    }

    const mainName = lines[1];

    if (mainName !== 'main') {
      throw new Error('Not Implemented');
    }

    const mainIdentifers = lines[2].split('\t');
    const mainValues = lines[3].split('\t');

    const mainObject = zipObject(mainIdentifers, mainValues);

    const sourcesName = lines[5];

    if (sourcesName !== 'srce') {
      throw new Error('Not Implemented');
    }

    const sourcesIdentifers = lines[7].split('\t');
    const sourcesValues = lines[8].split('\t');

    const sourcesObject = zipObject(sourcesIdentifers, sourcesValues);

    const subjectsName = lines[11];

    if (subjectsName !== 'sub') {
      throw new Error('Not Implemented');
    }

    const subjectsIdentifiers = lines[13].split('\t');
    const subjectsValues = lines[14].split('\t');

    const subjectsObject = zipObject(subjectsIdentifiers, subjectsValues);

    return {
      main: mainObject,
      sources: sourcesObject,
      subjects: subjectsObject,
    };
  }

  private async readHeader(): Promise<unknown> {
    const headerSection = await this.readSectionDescriptor();

    if (headerSection.type !== 'header') {
      throw new Error('Not Implemented');
    }

    const headerSectionData = await this.file.read(headerSection.sectionSize);

    const headerSectionDataInflated = await BinaryReader.create(
      headerSectionData
    ).inflate();

    const lines = headerSectionDataInflated.toString('utf8').split('\n');

    this.file.seek(headerSection.nextSectionOffset);

    return {};
  }

  private async readVolumeHeader() {
    const volumeSection = await this.readSectionDescriptor();

    if (volumeSection.type !== 'volume') {
      throw new Error('Not Implemented');
    }

    const volumeData = BinaryReader.create(
      await this.file.read(volumeSection.sectionSize)
    );

    const ewfVolumeHeader = await volumeData.struct(async reader => ({
      mediaType: reader.u8(),
      unknown1: reader.read(3),
      chunkCount: reader.u32(),
      sectorsPerChunk: reader.u32(),
      bytesPerSector: reader.u32(),
      sectorCount: reader.u32(),
      cylinders: reader.u32(),
      heads: reader.u32(),
      sectors: reader.u32(),
      mediaFlags: reader.u8(),
      unknown2: reader.read(3),
      PALMVolumeStartSector: reader.u32(),
      unknown3: reader.read(4),
      SMARTLogsStartSector: reader.u32(),
      compressionLevel: reader.u8(),
      unknown4: reader.read(3),
      sectorErrorGranularity: reader.u32(),
      unknown5: reader.read(4),
      segmentFileSetIdentifier: reader.read(16),
      unknown6: reader.read(963),
      signature: reader.read(5),
      checksum: reader.u32(),
    }));

    this.file.seek(volumeSection.nextSectionOffset);

    return ewfVolumeHeader;
  }
}

registryEntryPoint('ewf', async args => {
  const [fileName, ...rest] = args;

  const file = await MemoryFile.open(fileName);

  const ewfFile = await EWFFile.open(file);

  for (let i = 0; i < ewfFile.numberOfChunks; i++) {
    const chunk = await ewfFile.readChunk(i);

    process.stderr.write('.');
  }

  return 0;
});
