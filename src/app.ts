// import 'source-map-support/register';

import { VMWareDiskFile } from './container/vmdk';
import { NTFS, NTFSFileEntry } from './filesystem/ntfs';
import { MasterBootRecord } from './container/mbr';
import { BlobFile } from './file.browser';
import { expect } from './common';

export class WebApplication {
  private filesystem: HTMLInputElement;
  private openFileButton: HTMLButtonElement;
  private rootContainer: HTMLDivElement;

  constructor() {
    this.filesystem = document.querySelector('#filesystem') || expect('');
    this.openFileButton = document.querySelector('#openFile') || expect('');
    this.rootContainer = document.querySelector('#rootContainer') || expect('');

    this.openFileButton.addEventListener('click', () => {
      const files = this.filesystem.files;

      if (files === null || files[0] === undefined) {
        alert('No File Selected');
        return;
      }

      const file = files[0];

      this.openFile(file).catch(err => {
        throw err;
      });
    });
  }

  async openFile(file: File) {
    console.log('Opening Abstract Blob File');
    const blobFile = await BlobFile.create(file);

    console.log('Opening Disk Image');
    const vmdk = await VMWareDiskFile.open(blobFile);

    console.log('Opening Master Boot Record');
    const mbr = await MasterBootRecord.open(vmdk);

    console.log('Opening NTFS for root partition');
    const ntfs = await NTFS.open(mbr.partitions[0]);

    const root = await ntfs.getRootEntry();

    await this.displayDirectory(ntfs, this.rootContainer, root);
  }

  async displayDirectory(
    ntfs: NTFS,
    container: HTMLDivElement,
    fileEntry: NTFSFileEntry
  ) {
    const entries = await fileEntry.readDirectoryEntries();

    const folderDiv = document.createElement('div');

    folderDiv.classList.add('folder');

    for (const ent of entries) {
      const element = document.createElement('div');

      element.classList.add('entry');

      const detail = document.createElement('pre');

      const filename = await ntfs.getIndexFilename(ent);

      detail.textContent = `EntryIndex [${ent.fileReference.mftEntryIndex}:${ent.fileReference.sequenceNumber}] FileName [${filename}]`;

      element.appendChild(detail);

      const expandButton = document.createElement('button');

      expandButton.addEventListener('click', async () => {
        const entry = await ntfs.getFileByReference(ent.fileReference);

        await this.displayDirectory(ntfs, element, entry);
      });

      expandButton.textContent = 'Expand';

      element.appendChild(expandButton);

      folderDiv.appendChild(element);
    }

    container.appendChild(folderDiv);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new WebApplication();
});
