// Compares two Android screenshots (`adb exec-out screencap -p`) to tell whether video is moving
// on screen. A minimal PNG decoder: 8-bit RGB or RGBA, not interlaced, which is what screencap
// writes. No dependencies.
import { inflateSync } from 'node:zlib';

/** Decodes a PNG into {width, height, channels, pixels}. */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG.');
  let offset = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const [depth, color, , , interlace] = [data[8], data[9], data[10], data[11], data[12]];
      if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error('Unsupported PNG format.');
      channels = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** The fraction of pixels whose color changed noticeably between two screenshots of the same size. */
export function changedFraction(first, second, threshold = 24) {
  const a = decodePng(first), b = decodePng(second);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const p = i * a.channels, q = i * b.channels;
    const delta = Math.abs(a.pixels[p] - b.pixels[q]) + Math.abs(a.pixels[p + 1] - b.pixels[q + 1]) +
      Math.abs(a.pixels[p + 2] - b.pixels[q + 2]);
    if (delta > threshold) changed++;
  }
  return changed / (a.width * a.height);
}
