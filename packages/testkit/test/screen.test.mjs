import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { changedFraction, decodePng } from '../src/screen.mjs';

function png(width, height, pixel, filter = 0) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'ascii');
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = [filter];
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      // With the Sub filter each byte is stored as the difference from the pixel to its left.
      const left = filter === 1 && x > 0 ? pixel(x - 1, y) : [0, 0, 0, 0];
      row.push(...value.map((v, i) => (v - left[i]) & 0xff));
    }
    rows.push(Buffer.from(row));
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('decodes RGBA pixels, including the Sub filter', () => {
  const gradient = (x, y) => [x * 10, y * 10, 5, 255];
  for (const filter of [0, 1]) {
    const image = decodePng(png(4, 3, gradient, filter));
    assert.equal(image.width, 4); assert.equal(image.channels, 4);
    assert.deepEqual([...image.pixels.subarray((2 * 4 + 3) * 4, (2 * 4 + 3) * 4 + 4)], [30, 20, 5, 255]);
  }
});

test('measures how much of the screen changed', () => {
  const still = png(10, 10, () => [0, 0, 0, 255]);
  const half = png(10, 10, (x) => (x < 5 ? [0, 0, 0, 255] : [200, 200, 200, 255]));
  assert.equal(changedFraction(still, still), 0);
  assert.equal(changedFraction(still, half), 0.5);
});
