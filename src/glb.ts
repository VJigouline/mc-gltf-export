// Reads and writes GLB containers, and turns a GLB into a text glTF with its buffer inline.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GltfJson = Record<string, any>;

export function readGlb(glb: Uint8Array): { json: GltfJson; bin: Uint8Array } {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  let at = 12;
  let json: GltfJson | undefined;
  let bin: Uint8Array = new Uint8Array();
  while (at + 8 <= glb.length) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    const data = glb.subarray(at + 8, at + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004e4942) bin = data;
    at += 8 + length;
  }
  if (!json) throw new Error('The GLB has no JSON chunk');
  return { json, bin };
}

const pad4 = (n: number) => (4 - (n % 4)) % 4;

export function writeGlb(json: GltfJson, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = text.length + pad4(text.length);
  const binLength = bin.length + pad4(bin.length);
  const total = 12 + 8 + jsonLength + (bin.length ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + jsonLength);
  if (bin.length) {
    const at = 20 + jsonLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}

export function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A text glTF with the binary buffer inline as a data URI. */
export function glbToGltf(glb: Uint8Array): Uint8Array {
  const { json, bin } = readGlb(glb);
  if (json.buffers?.length) {
    json.buffers[0].uri = `data:application/octet-stream;base64,${base64(bin)}`;
    json.buffers[0].byteLength = bin.length;
  }
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}
