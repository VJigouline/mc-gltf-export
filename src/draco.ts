// Compresses the meshes of a GLB with Draco (KHR_draco_mesh_compression): each triangle
// primitive's attributes and indices become one Draco buffer view, and the data they replace is
// dropped from the binary buffer.

import { type GltfJson } from './glb.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The parts of Google's Draco encoder module that are used. */
export interface DracoEncoderModule {
  Encoder: new () => any;
  MeshBuilder: new () => any;
  Mesh: new () => any;
  DracoInt8Array: new () => any;
  POSITION: number;
  NORMAL: number;
  COLOR: number;
  TEX_COORD: number;
  GENERIC: number;
  MESH_EDGEBREAKER_ENCODING?: number;
  destroy(object: unknown): void;
}

export interface DracoSettings {
  /** Quantization bits by attribute. Defaults: position 14, normal 10, texture coordinates 12, colour 8. */
  quantization?: { position?: number; normal?: number; uv?: number; color?: number };
  /** Encoding and decoding speed, 0 (smallest) to 10 (fastest). Default 5. */
  speed?: number;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TYPES: Record<number, [Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor, number]> = {
  5120: [Int8Array, 127], 5121: [Uint8Array, 255], 5122: [Int16Array, 32767], 5123: [Uint16Array, 65535], 5125: [Uint32Array, 4294967295], 5126: [Float32Array, 1],
};

/** Reads an accessor's values as floats, undoing normalisation. */
function readAccessor(json: GltfJson, bin: Uint8Array, index: number): { values: Float32Array; size: number; count: number } {
  const a = json.accessors[index];
  const size = COMPONENTS[a.type]!;
  const [Type, max] = TYPES[a.componentType]!;
  const bv = json.bufferViews[a.bufferView];
  const stride = bv.byteStride || size * Type.BYTES_PER_ELEMENT;
  const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const view = new DataView(bin.buffer);
  const values = new Float32Array(a.count * size);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType as 5126] as 'getFloat32';
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < size; k++) {
      const v = view[get](start + i * stride + k * Type.BYTES_PER_ELEMENT, true);
      values[i * size + k] = a.normalized ? Math.max(v / max, -1) : v;
    }
  }
  return { values, size, count: a.count };
}

/**
 * Compresses every triangle primitive that has only positions, normals, texture coordinates and
 * colours. Returns the new JSON and binary buffer, and how many primitives were compressed.
 */
export function compressGlb(json: GltfJson, bin: Uint8Array, M: DracoEncoderModule, settings: DracoSettings = {}): { json: GltfJson; bin: Uint8Array; compressed: number; skipped: number } {
  const q = { position: 14, normal: 10, uv: 12, color: 8, ...settings.quantization };
  const speed = settings.speed ?? 5;
  const pieces: Uint8Array[] = [];
  const newViews: { index: number; data: Uint8Array }[] = [];
  const compressedAccessors = new Set<number>();
  const done = new Map<string, { view: number; attributes: Record<string, number> }>();
  let compressed = 0;
  let skipped = 0;
  const views = json.bufferViews ?? [];
  const accessorsBefore = new Map<number, number>();

  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      const names = Object.keys(p.attributes ?? {});
      const supported = (p.mode === undefined || p.mode === 4) && !p.targets && names.includes('POSITION') && names.every((n) => /^(POSITION|NORMAL|TEXCOORD_\d+|COLOR_0)$/.test(n));
      if (!supported) {
        skipped++;
        continue;
      }
      const key = JSON.stringify([p.attributes, p.indices]);
      let entry = done.get(key);
      if (!entry) {
        const position = readAccessor(json, bin, p.attributes.POSITION);
        const indices = p.indices !== undefined ? Uint32Array.from(readAccessor(json, bin, p.indices).values) : Uint32Array.from({ length: position.count }, (_, i) => i);
        const encoder = new M.Encoder();
        const builder = new M.MeshBuilder();
        const dracoMesh = new M.Mesh();
        builder.AddFacesToMesh(dracoMesh, indices.length / 3, indices);
        const add = (type: number, data: { values: Float32Array; size: number; count: number }) =>
          (builder.AddFloatAttribute ?? builder.AddFloatAttributeToMesh).call(builder, dracoMesh, type, data.count, data.size, data.values) as number;
        const attributes: Record<string, number> = {};
        for (const name of names) {
          const type = name === 'POSITION' ? M.POSITION : name === 'NORMAL' ? M.NORMAL : name === 'COLOR_0' ? M.COLOR : M.TEX_COORD;
          attributes[name] = add(type, readAccessor(json, bin, p.attributes[name]));
        }
        encoder.SetAttributeQuantization(M.POSITION, q.position);
        encoder.SetAttributeQuantization(M.NORMAL, q.normal);
        encoder.SetAttributeQuantization(M.TEX_COORD, q.uv);
        encoder.SetAttributeQuantization(M.COLOR, q.color);
        encoder.SetSpeedOptions(speed, speed);
        if (M.MESH_EDGEBREAKER_ENCODING !== undefined) encoder.SetEncodingMethod(M.MESH_EDGEBREAKER_ENCODING);
        const out = new M.DracoInt8Array();
        const length = encoder.EncodeMeshToDracoBuffer(dracoMesh, out);
        if (!length) {
          M.destroy(out);
          M.destroy(dracoMesh);
          M.destroy(builder);
          M.destroy(encoder);
          skipped++;
          continue;
        }
        const data = new Uint8Array(length);
        for (let i = 0; i < length; i++) data[i] = out.GetValue(i);
        // The decoded mesh may have fewer points than the original, when the encoder merges them.
        const points = typeof encoder.GetNumberOfEncodedPoints === 'function' ? encoder.GetNumberOfEncodedPoints() : position.count;
        const faces = typeof encoder.GetNumberOfEncodedFaces === 'function' ? encoder.GetNumberOfEncodedFaces() : indices.length / 3;
        M.destroy(out);
        M.destroy(dracoMesh);
        M.destroy(builder);
        M.destroy(encoder);
        const view = views.length + newViews.length;
        newViews.push({ index: view, data });
        entry = { view, attributes };
        done.set(key, entry);
        for (const name of names) accessorsBefore.set(p.attributes[name], points);
        if (p.indices !== undefined) accessorsBefore.set(p.indices, faces * 3);
      }
      p.extensions = { ...p.extensions, KHR_draco_mesh_compression: { bufferView: entry.view, attributes: entry.attributes } };
      for (const name of names) compressedAccessors.add(p.attributes[name]);
      if (p.indices !== undefined) compressedAccessors.add(p.indices);
      compressed++;
    }
  }
  if (!compressed) return { json, bin, compressed, skipped };

  // Accessors still used elsewhere (by uncompressed primitives, skins or animations) keep their data.
  const stillUsed = new Set<number>();
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      if (p.extensions?.KHR_draco_mesh_compression) continue;
      for (const a of Object.values(p.attributes ?? {})) stillUsed.add(a as number);
      if (p.indices !== undefined) stillUsed.add(p.indices);
      for (const t of p.targets ?? []) for (const a of Object.values(t)) stillUsed.add(a as number);
    }
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) stillUsed.add(skin.inverseBindMatrices);
  for (const animation of json.animations ?? []) for (const s of animation.samplers ?? []) stillUsed.add(s.input).add(s.output);
  for (const index of compressedAccessors) {
    if (stillUsed.has(index)) continue;
    const a = json.accessors[index];
    delete a.bufferView;
    delete a.byteOffset;
    const count = accessorsBefore.get(index);
    if (count !== undefined) a.count = count;
  }

  // The binary buffer is rebuilt with the views still referenced and the Draco data.
  const all = [...views.map((v: any, i: number) => ({ index: i, data: bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength), view: v })), ...newViews.map((n) => ({ index: n.index, data: n.data, view: { buffer: 0, byteLength: n.data.length } }))];
  const referenced = new Set<number>();
  for (const a of json.accessors ?? []) if (a.bufferView !== undefined) referenced.add(a.bufferView);
  for (const image of json.images ?? []) if (image.bufferView !== undefined) referenced.add(image.bufferView);
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) if (p.extensions?.KHR_draco_mesh_compression) referenced.add(p.extensions.KHR_draco_mesh_compression.bufferView);
  const remap = new Map<number, number>();
  const kept: any[] = [];
  let length = 0;
  for (const v of all) {
    if (!referenced.has(v.index)) continue;
    length += (4 - (length % 4)) % 4;
    remap.set(v.index, kept.length);
    const view = { ...v.view, byteOffset: length, byteLength: v.data.length };
    kept.push(view);
    pieces.push(v.data);
    length += v.data.length;
  }
  const out = new Uint8Array(length);
  kept.forEach((v, i) => out.set(pieces[i]!, v.byteOffset));
  json.bufferViews = kept;
  for (const a of json.accessors ?? []) if (a.bufferView !== undefined) a.bufferView = remap.get(a.bufferView);
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = remap.get(image.bufferView);
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) {
    const ext = p.extensions?.KHR_draco_mesh_compression;
    if (ext) ext.bufferView = remap.get(ext.bufferView);
  }
  json.buffers = [{ byteLength: out.length }];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'KHR_draco_mesh_compression'])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'KHR_draco_mesh_compression'])];
  return { json, bin: out, compressed, skipped };
}
