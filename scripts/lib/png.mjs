// A minimal PNG writer and reader for the game's icons: 8-bit RGB without transparency, no interlacing, every
// row stored unfiltered. That is all the icon generator writes, and the reader refuses anything else.
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BIT_DEPTH = 8;
const COLOR_TYPE_RGB = 2;
const CHANNELS = 3;
const IHDR_LENGTH_BYTES = 13;

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// `rgb` holds width * height * 3 bytes, rows from the top.
export function encodePng({ width, height, rgb }) {
  if (rgb.length !== width * height * CHANNELS) throw new Error("the pixel data does not match the size");
  const header = Buffer.alloc(IHDR_LENGTH_BYTES);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = BIT_DEPTH;
  header[9] = COLOR_TYPE_RGB;
  const rowLength = width * CHANNELS;
  const rows = Buffer.alloc(height * (rowLength + 1));
  for (let y = 0; y < height; y++) {
    // The byte before each row names its filter: 0, none.
    Buffer.from(rgb.buffer, rgb.byteOffset + y * rowLength, rowLength).copy(rows, y * (rowLength + 1) + 1);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function readChunks(png) {
  if (png.subarray(0, SIGNATURE.length).equals(SIGNATURE) !== true) throw new Error("not a PNG file");
  const chunks = [];
  let offset = SIGNATURE.length;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

// Reads a file written by `encodePng` back into { width, height, rgb }.
export function decodePng(png) {
  const chunks = readChunks(png);
  const header = chunks.find((entry) => entry.type === "IHDR")?.data;
  if (header === undefined || header.length !== IHDR_LENGTH_BYTES) throw new Error("the PNG has no header");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  // Bit depth, colour type, compression, filter method, interlace.
  if (
    header[8] !== BIT_DEPTH ||
    header[9] !== COLOR_TYPE_RGB ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0
  ) {
    throw new Error("only 8-bit RGB without interlacing is read");
  }
  const rows = inflateSync(Buffer.concat(chunks.filter((entry) => entry.type === "IDAT").map((entry) => entry.data)));
  const rowLength = width * CHANNELS;
  if (rows.length !== height * (rowLength + 1)) throw new Error("the PNG data does not match its size");
  const rgb = new Uint8Array(width * height * CHANNELS);
  for (let y = 0; y < height; y++) {
    const start = y * (rowLength + 1);
    if (rows[start] !== 0) throw new Error("only unfiltered rows are read");
    rgb.set(rows.subarray(start + 1, start + 1 + rowLength), y * rowLength);
  }
  return { width, height, rgb };
}

// Every pixel becomes a square of `factor` by `factor` pixels: no smoothing, so pixel art stays sharp.
export function scaleNearest({ width, height, rgb }, factor) {
  if (!Number.isInteger(factor) || factor < 1) throw new Error("the scale must be a whole number");
  const scaled = new Uint8Array(width * factor * height * factor * CHANNELS);
  const scaledRowLength = width * factor * CHANNELS;
  for (let y = 0; y < height; y++) {
    const firstRow = y * factor * scaledRowLength;
    for (let x = 0; x < width; x++) {
      const pixel = rgb.subarray((y * width + x) * CHANNELS, (y * width + x + 1) * CHANNELS);
      for (let i = 0; i < factor; i++) scaled.set(pixel, firstRow + (x * factor + i) * CHANNELS);
    }
    for (let i = 1; i < factor; i++) {
      scaled.copyWithin(firstRow + i * scaledRowLength, firstRow, firstRow + scaledRowLength);
    }
  }
  return { width: width * factor, height: height * factor, rgb: scaled };
}
