# Disk Forensics Library for Node.js/Browser

> **Work In Progress:** This library is still a work in progress and features have not been broadly tested.

## Installation

```sh
# Clone the repository and change into the root directory.
yarn install
```

## Testing

Right now testing for the NTFS code is being run against the disk image from a Windows 10 Virtual Machine with the disk image in `.VMDK` format.

To replicate the current state of my testing...

- Install Windows 10 onto a Virtual Machine managed by QEMU.
- Shut Down the VM once installation is complete.
- Convert the Disk Image into `.vmdk` format and store it under `testData/win10/win10.vmdk` (The filename doesn't matter).
- Run `yarn start ntfs testData/win10/win10.vmdk` to replicate my current testing.
