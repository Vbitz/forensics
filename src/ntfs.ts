// Documentation from: https://github.com/libyal/libfsntfs/blob/master/documentation/New%20Technologies%20File%20System%20(NTFS).asciidoc#mft-entry-header

import { toHex, expect } from './common';
import { EWFFile } from './ewfFile';
import { MemoryFile, File } from './file';
import { promises, read } from 'fs';
import { BinaryReader } from './reader';

interface BootSectorHeader {
  jmpInstruction: Buffer;
  oemId: string;
  bytesPerSector: number;
  sectorsPerCluster: number;
  reservedSectors: number;
  unused1: Buffer;
  unused2: Buffer;
  mediaDescriptor: number;
  unused3: unknown;
  sectorsPerTrack: number;
  numberOfHeads: number;
  hiddenSectors: number;
  unused4: Buffer;
  unused5: Buffer;
  totalSectors: number;
  mftClusterNumber: number;
  mftMirrorClusterNumber: number;
  perFileRecordSegment: number;
  unused6: Buffer;
  perIndexBuffer: number;
  unused7: Buffer;
  volumeSerialNumber: string;
  checksum: number;
  bootstrapCode: Buffer;
  endOfSector: string;
}

interface MFTAttribute {
  attributeType: AttributeType;
  recordLength: number;
  nonResidentFlag: number;
  nameLength: number;
  nameOffset: number;
  attributeDataFlags: number;
  attributeIdentifer: number;

  name: string;
  attributeTypeString: string;

  nonResidentData: MFTNonResidentData | undefined;
  residentData: MFTResidentData | undefined;
}

interface MFTNonResidentData {
  firstVirtualClusterNumber: number;
  lastVirtualClusterNumber: number;
  dataRunsOffset: number;
  compressionUnitSize: number;
  padding: Buffer;
  allocatedDataLength: number;
  dataSize: number;
  validDataSize: number;
  totalAllocatedSize: number | undefined;
}

interface MFTResidentData {
  dataSize: number;
  dataOffset: number;
  indexedFlag: number;
  padding: Buffer;
}

enum AttributeType {
  Unused = 0x00000000,
  STANDARD_INFORMATION = 0x00000010,
  ATTRIBUTE_LIST = 0x00000020,
  FILE_NAME = 0x00000030,
  VOLUME_VERSION = 0x00000040,
  OBJECT_ID = 0x00000040,
  SECURITY_DESCRIPTOR = 0x00000050,
  VOLUME_NAME = 0x00000060,
  VOLUME_INFORMATION = 0x00000070,
  DATA = 0x00000080,
  INDEX_ROOT = 0x00000090,
  INDEX_ALLOCATION = 0x000000a0,
  BITMAP = 0x000000b0,
  SYMBOLIC_LINK = 0x000000c0,
  REPARSE_POINT = 0x000000c0,
  EA_INFORMATION = 0x000000d0,
  EA = 0x000000e0,
  PROPERTY_SET = 0x000000f0,
  LOGGED_UTILITY_STREAM = 0x00000100,
  FIRST_USER_ATTRIBUTE = 0x00001000,
  END_OF_ATTRIBUTES = 0xffffffff,
}

export class NTFS {
  private _bootSectorHeader: BootSectorHeader | undefined = undefined;

  private constructor(private file: File) {}

  private get bootSectorHeader() {
    return this._bootSectorHeader || expect('BootSectorHeader === undefined');
  }

  static async open(file: File): Promise<NTFS> {
    const ntfs = new NTFS(file);

    await ntfs.parse();

    return ntfs;
  }

  private async parse() {
    await this.readBootSector();

    const mftCluster = BinaryReader.create(
      await this.readCluster(this.bootSectorHeader.mftClusterNumber)
    );

    await promises.writeFile('mftCluster.bin', mftCluster.buffer);

    const mftEntryHeader = await mftCluster.struct(async reader => ({
      signature: reader.assertMagic(toHex('FILE')),
      fixUpValuesOffset: reader.u16(),
      fixUpValuesCount: reader.u16(),
      metadataTransactionJournalSequenceNumber: reader.u64(),
      sequenceNumber: reader.u16(),
      referenceLinkCount: reader.u16(),
      firstAttributesOffset: reader.u16(),
      entryFlags: reader.u16(),
      usedEntrySize: reader.u32(),
      totalEntrySize: reader.u32(),
      baseRecordFileReference: reader.u64(),
      firstAvailableAttributeIdentifer: reader.u16(),
      unknown1: reader.read(2),
      unknown2: reader.read(4),
      unknown3: reader.read(2),
      index: reader.u32(),
    }));

    mftCluster.seek(mftEntryHeader.firstAttributesOffset);

    const mftAttributes: MFTAttribute[] = [];

    while (true) {
      const attribute = await this.readMFTAttribute(mftCluster);

      if (attribute === undefined) {
        break;
      }

      mftAttributes.push(attribute);
    }

    console.log(mftAttributes);

    // console.log(mftCluster);
  }

  private async readBootSector() {
    const firstChunk = await this.file.read(0x200);

    const bootSectorContents = BinaryReader.create(firstChunk);

    this._bootSectorHeader = await bootSectorContents.struct(async reader => ({
      jmpInstruction: reader.read(3),
      oemId: reader.assertMagic(toHex('NTFS    ')),
      bytesPerSector: reader.u16(),
      sectorsPerCluster: reader.u8(),
      reservedSectors: reader.u16(),
      unused1: reader.read(3),
      unused2: reader.read(2),
      mediaDescriptor: reader.u8(),
      unused3: reader.read(2),
      sectorsPerTrack: reader.u16(),
      numberOfHeads: reader.u16(),
      hiddenSectors: reader.u32(),
      unused4: reader.read(4),
      unused5: reader.read(4),
      totalSectors: reader.u64(),
      mftClusterNumber: reader.u64(),
      mftMirrorClusterNumber: reader.u64(),
      perFileRecordSegment: reader.s8(),
      unused6: reader.read(3),
      perIndexBuffer: reader.s8(),
      unused7: reader.read(3),
      volumeSerialNumber: reader.hex(8),
      checksum: reader.u32(),
      bootstrapCode: reader.read(426),
      endOfSector: reader.assertMagic('55aa'),
    }));
  }

  private async readCluster(index: number) {
    const clusterSize =
      this.bootSectorHeader.bytesPerSector *
      this.bootSectorHeader.sectorsPerCluster;
    return this.file.readAbsolute(index * clusterSize, clusterSize);
  }

  private async readMFTAttribute(
    cluster: BinaryReader
  ): Promise<MFTAttribute | undefined> {
    if (
      (await cluster.peek(async reader => reader.u32())) ===
      AttributeType.END_OF_ATTRIBUTES
    ) {
      return undefined;
    }

    const attribute = await cluster.peek(async cluster => {
      const values: MFTAttribute = await cluster.struct(async reader => ({
        attributeType: reader.u32(),
        attributeTypeString: '',
        recordLength: reader.u32(),
        nonResidentFlag: reader.u8(),
        nameLength: reader.u8(),
        nameOffset: reader.u16(),
        attributeDataFlags: reader.u16(),
        attributeIdentifer: reader.u16(),
        name: '',
        nonResidentData: undefined,
        residentData: undefined,
      }));

      values.attributeTypeString = AttributeType[values.attributeType];

      values.name = await cluster.seekTemp(values.nameOffset, async reader => {
        return reader.utf16le(values.nameLength);
      });

      if (values.nonResidentFlag === 0) {
        values.residentData = await cluster.struct(async reader => ({
          dataSize: reader.u32(),
          dataOffset: reader.u16(),
          indexedFlag: reader.u8(),
          padding: reader.read(1),
        }));
      } else if (values.nonResidentFlag === 1) {
        values.nonResidentData = await cluster.struct(async reader => ({
          firstVirtualClusterNumber: reader.u64(),
          lastVirtualClusterNumber: reader.u64(),
          dataRunsOffset: reader.u16(),
          compressionUnitSize: reader.u16(),
          padding: reader.read(4),
          allocatedDataLength: reader.u64(),
          dataSize: reader.u64(),
          validDataSize: reader.u64(),

          totalAllocatedSize: undefined,
        }));

        if (values.nonResidentData.compressionUnitSize > 0) {
          values.nonResidentData.totalAllocatedSize = cluster.u64();
        }
      }

      return values;
    });

    cluster.seek(cluster.tell() + attribute.recordLength);

    return attribute;
  }
}

export async function ntfsMain(args: string[]): Promise<number> {
  const [fileName, ...rest] = args;

  const memoryFile = await MemoryFile.open(fileName);

  const ewfFile = await EWFFile.open(memoryFile);

  const ntfs = await NTFS.open(ewfFile);

  return 0;
}
