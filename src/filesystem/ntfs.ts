// Documentation from: https://github.com/libyal/libfsntfs/blob/master/documentation/New%20Technologies%20File%20System%20(NTFS).asciidoc

import { toHex, expect } from '../common';
import { File, DiskFile } from '../file';
import { BinaryReader } from '../reader';
import { VMWareDiskFile } from '../container/vmdk';
import { MasterBootRecord } from '../container/mbr';
import { registryEntryPoint } from '../entryPoint';

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
  offset: number;

  attributeType: AttributeType;
  recordLength: number;
  nonResidentFlag: number;
  nameLength: number;
  nameOffset: number;
  attributeDataFlags: number;
  attributeIdentifer: number;

  name: string | undefined;
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

export class NTFSFile extends File {
  private constructor(
    private entry: NTFSFileEntry,
    private dataAttribute: MFTAttribute
  ) {
    super();
  }

  static async open(entry: NTFSFileEntry) {
    const dataAttribute = entry.getAttributesByType(AttributeType.DATA);

    if (dataAttribute.length !== 1) {
      throw new Error('Only one data attribute is supported.');
    }

    return new NTFSFile(entry, dataAttribute[0]);
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    const clusterSize = this.entry.owner.clusterSize;

    if (this.dataAttribute.nonResidentData === undefined) {
      throw new Error('Not Implemented');
    }

    // if (offset % clusterSize !== 0 || size % clusterSize !== 0) {
    //   console.log(offset, size, clusterSize);
    //   throw new Error('Unaligned reads not implemented');
    // }

    const firstCluster =
      this.entry.clusterNumber +
      this.dataAttribute.nonResidentData.firstVirtualClusterNumber +
      Math.floor(offset / clusterSize);

    const clusterOffset = offset % clusterSize;

    const clusterCount = Math.ceil(size / clusterSize);

    return (await this.readOwnerCluster(firstCluster, clusterCount)).slice(
      clusterOffset,
      clusterOffset + size
    );
  }

  private async readOwnerCluster(index: number, count = 1) {
    return this.entry.owner.readClusters(index, count);
  }
}

function ntDateTime(reader: BinaryReader): Date {
  let value = BigInt(reader.u64());

  const adjust = 11644473600000n * 10000n;

  value -= adjust;

  return new Date(Number(value / 10000n));
}

export class NTFSFileEntry {
  clusterNumber = 0;

  private _cluster: BinaryReader | undefined;
  private mftAttributes: MFTAttribute[] = [];

  private constructor(readonly owner: NTFS, readonly index: number) {}

  private get cluster() {
    return this._cluster || expect('Entry not parsed.');
  }

  static async create(
    owner: NTFS,
    index: number,
    clusterNumber: number,
    cluster: BinaryReader
  ) {
    const newEntry = new NTFSFileEntry(owner, index);

    await newEntry.parse(clusterNumber, cluster);

    return newEntry;
  }

  async parse(clusterNumber: number, cluster: BinaryReader) {
    this.clusterNumber = clusterNumber;

    this._cluster = cluster;

    const mftEntryHeader = await this.cluster.struct(async reader => ({
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
      baseRecordFileReference: await this.readFileReference(reader),
      firstAvailableAttributeIdentifer: reader.u16(),
      unknown1: reader.read(2),
      unknown2: reader.read(4),
      unknown3: reader.read(2),
      index: reader.u32(),
    }));

    // console.log(mftEntryHeader);

    this.cluster.seek(mftEntryHeader.firstAttributesOffset);

    while (true) {
      const attribute = await this.readAttribute(this.cluster);

      if (attribute === undefined) {
        break;
      }

      this.mftAttributes.push(attribute);
    }
  }

  async getFileName() {
    const fileNameAttribute = await this.readFileNameAttribute();

    if (fileNameAttribute === undefined) {
      return undefined;
    }

    return fileNameAttribute.nameString;
  }

  getAttributeNames() {
    return this.mftAttributes.map(attr => attr.attributeTypeString);
  }

  async open(): Promise<NTFSFile> {
    return NTFSFile.open(this);
  }

  private async readFileReference(reader: BinaryReader) {
    return reader.struct(async reader => ({
      mftEntryIndex: reader.u32(),
      unused: reader.read(2),
      sequenceNumber: reader.u16(),
    }));
  }

  private async readFileNameAttribute() {
    const fileNameAttribute = this.getAttributesByType(AttributeType.FILE_NAME);

    if (fileNameAttribute.length === 0) {
      return undefined;
    }

    const fileNameData = BinaryReader.create(
      await this.getAttributeData(fileNameAttribute[0])
    );

    const fileNameStructure = await fileNameData.struct(async reader => ({
      parentFileReference: reader.u64(),
      creationDateTime: ntDateTime(reader),
      lastModificationDateTime: ntDateTime(reader),
      mftEntryLastModifyDateTime: ntDateTime(reader),
      lastAccessDateTime: ntDateTime(reader),
      allocatedFileSize: reader.u64(),
      fileSize: reader.u64(),
      fileAttributeFlags: reader.u32(),
      extendedData: reader.u32(),
      nameStringSize: reader.u8(),
      nameNamespace: reader.u8(),
      nameString: '',
    }));

    fileNameStructure.nameString = fileNameData.utf16le(
      fileNameStructure.nameStringSize * 2
    );

    // console.log(fileNameStructure);

    return fileNameStructure;
  }

  private async readStandardInformationAttribute() {
    const standardInformationAttribute = this.getAttributesByType(
      AttributeType.STANDARD_INFORMATION
    );

    if (standardInformationAttribute.length !== 1) {
      return undefined;
    }

    const standardInformationData = BinaryReader.create(
      await this.getAttributeData(standardInformationAttribute[0])
    );

    return standardInformationData.struct(async reader => ({
      creationDateTime: ntDateTime(reader),
      lastModifyDateTime: ntDateTime(reader),
      mftEntryLastModifyDateTime: ntDateTime(reader),
      lastAccessDateTime: ntDateTime(reader),
      fileAttributeFlags: ntDateTime(reader),
      uk1: reader.u32(),
      uk2: reader.u32(),
      uk3: reader.u32(),
    }));
  }

  async getData(): Promise<Buffer> {
    const dataAttribute = this.getAttributesByType(AttributeType.DATA);

    if (dataAttribute.length !== 1) {
      throw new Error('Not Implemented');
    }

    const mftData = await this.getAttributeData(dataAttribute[0]);

    return mftData;
  }

  async readDirectoryEntries() {
    const indexAttributes = this.getAttributesByType(AttributeType.INDEX_ROOT);

    if (indexAttributes.length !== 1) {
      throw new Error('Only 1 INDEX_ROOT is supported.');
    }

    const indexRootData = BinaryReader.create(
      await this.getAttributeData(indexAttributes[0])
    );

    const indexRootHeader = await indexRootData.struct(async reader => ({
      attributeType: reader.u32(),
      collationType: reader.u32(),
      indexEntrySize: reader.u32(),
      indexEntryNumber: reader.u32(),
    }));

    // console.log(indexRootHeader);

    const indexNodeHeaderStart = indexRootData.tell();

    const indexNodeHeader = await indexRootData.struct(async reader => ({
      indexValuesOffset: reader.u32(),
      indexNodeSize: reader.u32(),
      allocatedIndexNodeSize: reader.u32(),
      indexNodeFlags: reader.u32(),
    }));

    // console.log(indexNodeHeader);
  }

  private async readAttribute(
    cluster: BinaryReader
  ): Promise<MFTAttribute | undefined> {
    if (cluster.tell() > cluster.buffer.length) {
      return undefined;
    }

    if (
      (await cluster.peek(async reader => reader.u32())) ===
      AttributeType.END_OF_ATTRIBUTES
    ) {
      return undefined;
    }

    const attribute = await cluster.peek(async cluster => {
      const offset = cluster.tell();

      const values: MFTAttribute = await cluster.struct(async reader => ({
        offset,
        attributeType: reader.u32(),
        attributeTypeString: '',
        recordLength: reader.u32(),
        nonResidentFlag: reader.u8(),
        nameLength: reader.u8(),
        nameOffset: reader.u16(),
        attributeDataFlags: reader.u16(),
        attributeIdentifer: reader.u16(),
        name: undefined,
        nonResidentData: undefined,
        residentData: undefined,
      }));

      values.attributeTypeString = AttributeType[values.attributeType];

      values.name = await cluster.seekTemp(
        offset + values.nameOffset,
        async reader => {
          return reader.utf16le(values.nameLength);
        }
      );

      if (values.name.length === 0) {
        values.name = undefined;
      }

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

  private async getAttributeData(attr: MFTAttribute): Promise<Buffer> {
    if (attr.nonResidentData !== undefined) {
      return this.owner.readClusters(
        this.clusterNumber + attr.nonResidentData.firstVirtualClusterNumber,
        attr.nonResidentData.lastVirtualClusterNumber -
          attr.nonResidentData.firstVirtualClusterNumber
      );
    } else if (attr.residentData !== undefined) {
      return this.cluster.seekTemp(
        attr.offset + attr.residentData.dataOffset,
        async reader => reader.read(attr.residentData!.dataSize)
      );
    } else {
      throw new Error('Not Implemented');
    }
  }

  getAttributesByType(type: AttributeType) {
    return this.mftAttributes.filter(attr => attr.attributeType === type);
  }

  getAttributesByName(name: string) {
    return this.mftAttributes.filter(attr => attr.name === name);
  }
}

export class NTFS {
  private _bootSectorHeader: BootSectorHeader | undefined = undefined;

  private files: NTFSFileEntry[] = [];
  private _mft: NTFSFileEntry | undefined = undefined;
  private rootEntry: NTFSFileEntry | undefined = undefined;

  private constructor(private file: File) {}

  private get bootSectorHeader() {
    return this._bootSectorHeader || expect('BootSectorHeader === undefined');
  }

  get mft() {
    return this._mft || expect('MFT === undefined');
  }

  async getRootEntry(): Promise<NTFSFileEntry> {
    if (this.rootEntry !== undefined) {
      return this.rootEntry;
    }

    for (const file of this.files) {
      if (file.index > 32) {
        break;
      }

      const fileName = await file.getFileName();

      if (fileName === '.') {
        this.rootEntry = file;
        return file;
      }
    }
    throw new Error('Could not find "." in MFT');
  }

  get clusterSize() {
    return (
      this.bootSectorHeader.bytesPerSector *
      this.bootSectorHeader.sectorsPerCluster
    );
  }

  static async open(file: File): Promise<NTFS> {
    const ntfs = new NTFS(file);

    await ntfs.parse();

    return ntfs;
  }

  private async parse() {
    await this.readBootSector();

    const mftClusterNumber = this.bootSectorHeader.mftClusterNumber;

    const mftCluster = BinaryReader.create(
      await this.readClusters(mftClusterNumber)
    );

    this._mft = await NTFSFileEntry.create(
      this,
      0,
      mftClusterNumber,
      mftCluster
    );

    // const mftData = BinaryReader.create(await mftEntry.getData());

    const mftFile = await this._mft.open();

    await this.readMFT(mftClusterNumber, mftFile);
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

  async readClusters(index: number, count = 1) {
    const clusterSize = this.clusterSize;
    if (count === 1) {
      return this.file.readAbsolute(index * clusterSize, clusterSize);
    } else {
      return this.file.readAbsolute(index * clusterSize, clusterSize * count);
    }
  }

  private async readMFT(mftBaseCluster: number, mftData: File) {
    let index = 0;

    // console.log(mftData.buffer.length);

    for (let i = 0; i < 32; i++) {
      const entry = BinaryReader.create(await mftData.read(1024));

      if ((await entry.peek(async reader => reader.u32())) === 0) {
        index += 1;

        continue;
      }

      // TODO(joshua): Calculate correct cluster numbers.
      const newEntry = await NTFSFileEntry.create(
        this,
        index,
        mftBaseCluster + index * 2,
        entry
      );

      this.files.push(newEntry);

      index += 1;
    }
  }
}

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
