import 'source-map-support/register';

import { VMWareDiskFile } from './container/vmdk';
import { NTFS } from './filesystem/ntfs';
import { MasterBootRecord } from './container/mbr';
import { BlobFile } from './file.browser';
import { expect } from './common';

export class WebApplication {
  private filesystem: HTMLInputElement;
  private openFileButton: HTMLButtonElement;

  constructor() {
    this.filesystem = document.querySelector('#filesystem') || expect('');
    this.openFileButton = document.querySelector('#openFile') || expect('');

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

    console.log('Root Attribute Names', root.getAttributeNames());

    console.log('Root Directory Entry', await root.readDirectoryEntries());
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new WebApplication();
});
