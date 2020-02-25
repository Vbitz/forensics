import { File } from '../file';
import { BinaryReader } from '../reader';
import { stripZeros as stripNulls } from '../common';

export class TarFile extends File {
  constructor(
    readonly owner: TarArchive,
    readonly fileName: string,
    readonly startSector: number,
    readonly fileSize: number
  ) {
    super();
  }

  async readAbsolute(offset: number, size: number): Promise<Buffer> {
    return this.owner.file.readAbsolute(
      this.startSector * TarArchive.sectorSize,
      size
    );
  }
}

export class TarArchive {
  static sectorSize = 512;

  private _files: TarFile[] = [];

  private constructor(readonly file: File) {}

  static async open(file: File) {
    const tar = new TarArchive(file);

    await tar.parse();

    return tar;
  }

  get files() {
    return this._files;
  }

  private async parse() {
    let currentSector = 0;
    while (true) {
      const headerSector = await (async () => {
        try {
          return BinaryReader.create(await this.readSectors(currentSector));
        } catch (ex) {
          return undefined;
        }
      })();

      if (headerSector === undefined) {
        break;
      }

      currentSector += 1;

      const fileHeader = await headerSector.struct(async reader => ({
        name: stripNulls(reader.ascii(100)),
        mode: Number.parseInt(stripNulls(reader.ascii(8)), 8),
        ownerUid: Number.parseInt(stripNulls(reader.ascii(8)), 8),
        ownerGid: Number.parseInt(stripNulls(reader.ascii(8)), 8),
        fileSize: Number.parseInt(stripNulls(reader.ascii(12)), 8),
        lastModificationTime: new Date(
          Number.parseInt(stripNulls(reader.ascii(12)), 8) * 1000
        ),
        checksum: Number.parseInt(stripNulls(reader.ascii(8)), 8),
        linkType: stripNulls(reader.ascii(1)),
      }));

      console.log(fileHeader);

      this._files.push(
        new TarFile(this, fileHeader.name, currentSector, fileHeader.fileSize)
      );

      const endSector =
        currentSector + Math.ceil(fileHeader.fileSize / TarArchive.sectorSize);

      currentSector = endSector;
    }
  }

  private async readSectors(sectorNumber: number, count = 1): Promise<Buffer> {
    return this.file.readAbsolute(
      sectorNumber * TarArchive.sectorSize,
      count * TarArchive.sectorSize
    );
  }

  async getFileWithName(name: string): Promise<TarFile> {
    throw new Error('Not Implemented');
  }
}
