const fs = require('fs');
const path = require('path');

// Write ICO with embedded PNG - modern ICO files support PNG data
const pngPath = path.resolve(__dirname, 'icon.png');
const icoPath = path.resolve(__dirname, 'icon.ico');

const pngData = fs.readFileSync(pngPath);

// ICO header
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // ICO type
header.writeUInt16LE(1, 4); // 1 image

// Directory entry (for PNG, dimensions are set to 0 which means "use PNG dimensions")
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0);  // width (0 = 256)
dirEntry.writeUInt8(0, 1);  // height (0 = 256)
dirEntry.writeUInt8(0, 2);  // colors
dirEntry.writeUInt8(0, 3);  // reserved
dirEntry.writeUInt16LE(1, 4); // planes (must be 1 for ICO)
dirEntry.writeUInt16LE(32, 6); // bpp
dirEntry.writeUInt32LE(pngData.length, 8); // image size
dirEntry.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

const ico = Buffer.concat([header, dirEntry, pngData]);
fs.writeFileSync(icoPath, ico);
console.log('ICO created: ' + ico.length + ' bytes at ' + icoPath);
