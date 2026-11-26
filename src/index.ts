// Writes three.js scenes as glTF 2.0 with three.js's GLTFExporter: binary GLB (the default) or
// text glTF, optionally with Draco mesh compression (KHR_draco_mesh_compression).

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { fileName, type ExportFile } from './common.js';
import { compressGlb, type DracoEncoderModule, type DracoSettings } from './draco.js';
import { glbToGltf, readGlb, writeGlb } from './glb.js';

export { type ExportFile } from './common.js';
export { compressGlb, type DracoEncoderModule, type DracoSettings } from './draco.js';
export { readGlb, writeGlb, glbToGltf } from './glb.js';

export interface GltfOptions {
  /** Binary GLB (the default), one compact file; or text glTF with the binary data inline. */
  binary?: boolean;
  /** Compresses meshes with Draco. Viewers need a Draco decoder to open the file. Default false. */
  draco?: boolean | (DracoSettings & { encoder?: DracoEncoderModule });
  /** Leaves out hidden objects. Default true. */
  onlyVisible?: boolean;
  /** Largest texture side, in pixels. Default 4096. */
  maxTextureSize?: number;
  /** Animation clips to include. */
  animations?: THREE.AnimationClip[];
  /** The file's name, without extension. Default 'scene'. */
  name?: string;
}

export interface GltfExportResult {
  file: ExportFile;
  warnings: string[];
  stats: { meshes: number; primitives: number; compressed: number; bytes: number };
}

let sharedEncoder: Promise<DracoEncoderModule> | undefined;

/** Loads draco3d's encoder in Node, once. In browsers, use createDracoEncoder. */
export function loadDracoEncoder(): Promise<DracoEncoderModule> {
  if (!sharedEncoder) sharedEncoder = import('draco3d/draco_encoder_nodejs.js').then((m) => (m.default as (o: object) => Promise<DracoEncoderModule>)({}));
  return sharedEncoder;
}

/**
 * Makes an encoder module from the text of Google's browser encoder, draco_encoder.js, as
 * Google and three.js have published it.
 */
export function createDracoEncoder(source: string): Promise<DracoEncoderModule> {
  // Hiding Node's globals makes the encoder take its browser path.
  const factory = new Function('process', 'require', 'module', 'exports', `${source}\nreturn DracoEncoderModule;`)(undefined, undefined, undefined, undefined) as (options: object) => unknown;
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (m: DracoEncoderModule & { then?: unknown }) => {
      if (settled) return;
      settled = true;
      delete m.then;
      resolve(m);
    };
    try {
      const m = factory({ onModuleLoaded: done, onAbort: (reason: unknown) => reject(new Error(`The Draco encoder could not start: ${String(reason)}`)) }) as DracoEncoderModule & { calledRun?: boolean };
      // Encoders built without WebAssembly are ready at once.
      if (m && typeof m.Encoder === 'function' && m.calledRun !== false) setTimeout(() => done(m), 0);
    } catch (error) {
      reject(error);
    }
  });
}

/** Writes the scene under `root`, or the objects listed, as glTF. Lights and cameras are included. */
export async function exportGltf(root: THREE.Object3D | THREE.Object3D[], options: GltfOptions = {}): Promise<GltfExportResult> {
  const warnings: string[] = [];
  const exporter = new GLTFExporter();
  const warn = console.warn;
  let glb: Uint8Array;
  try {
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]).replace(/^THREE\.GLTFExporter:\s*/, ''));
    const result = await exporter.parseAsync(root, {
      binary: true,
      onlyVisible: options.onlyVisible !== false,
      maxTextureSize: options.maxTextureSize ?? 4096,
      animations: options.animations ?? [],
      truncateDrawRange: false,
    });
    glb = new Uint8Array(result as ArrayBuffer);
  } finally {
    console.warn = warn;
  }
  let { json, bin } = readGlb(glb);
  const meshes = json.meshes?.length ?? 0;
  const primitives = (json.meshes ?? []).reduce((n: number, m: { primitives?: unknown[] }) => n + (m.primitives?.length ?? 0), 0);
  let compressed = 0;
  if (options.draco) {
    const settings = typeof options.draco === 'object' ? options.draco : {};
    const encoder = settings.encoder ?? (await loadDracoEncoder());
    const r = compressGlb(json, bin, encoder, settings);
    json = r.json;
    bin = r.bin;
    compressed = r.compressed;
    if (r.skipped) warnings.push(`${r.skipped} primitives were left uncompressed: Draco compresses triangles with positions, normals, texture coordinates and colours, without morph targets`);
  }
  json.asset = { ...json.asset, generator: `mc-gltf-export, ${json.asset?.generator ?? 'three.js'}` };
  glb = writeGlb(json, bin);
  const binary = options.binary !== false;
  const data = binary ? glb : glbToGltf(glb);
  return {
    file: { name: fileName(options.name, binary ? 'glb' : 'gltf'), data, mimeType: binary ? 'model/gltf-binary' : 'model/gltf+json' },
    warnings,
    stats: { meshes, primitives, compressed, bytes: data.length },
  };
}
