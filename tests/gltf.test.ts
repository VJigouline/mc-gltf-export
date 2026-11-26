import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import createDecoderModule from 'draco3d/draco_decoder_nodejs.js';
import { describe, expect, it } from 'vitest';
import { exportGltf, readGlb, writeGlb } from '../src/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function scene() {
  const s = new THREE.Scene();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshStandardMaterial({ name: 'Red', color: 0xff0000 }));
  ball.name = 'Ball';
  ball.position.set(2, 0, 0);
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ name: 'Blue', color: 0x0000ff }));
  box.name = 'Box';
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  hidden.visible = false;
  s.add(ball, box, hidden);
  return s;
}

/** A DRACOLoader stand-in for Node, decoding with draco3d's decoder. */
async function dracoLoader() {
  const M: any = await createDecoderModule({});
  return {
    decodeDracoFile(buffer: ArrayBuffer, onLoad: (g: THREE.BufferGeometry) => void, ids: Record<string, number>) {
      const decoder = new M.Decoder();
      const mesh = new M.Mesh();
      const array = new Int8Array(buffer);
      const status = decoder.DecodeArrayToMesh(array, array.byteLength, mesh);
      if (!status.ok()) throw new Error(status.error_msg());
      const g = new THREE.BufferGeometry();
      for (const [name, id] of Object.entries(ids)) {
        const attribute = decoder.GetAttributeByUniqueId(mesh, id);
        const size = attribute.num_components();
        const bytes = mesh.num_points() * size * 4;
        const ptr = M._malloc(bytes);
        decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, M.DT_FLOAT32, bytes, ptr);
        g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(M.HEAPF32.buffer, ptr, bytes / 4).slice(), size));
        M._free(ptr);
      }
      const faces = mesh.num_faces();
      const ptr = M._malloc(faces * 12);
      decoder.GetTrianglesUInt32Array(mesh, faces * 12, ptr);
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(M.HEAPF32.buffer, ptr, faces * 3).slice(), 1));
      M._free(ptr);
      onLoad(g);
    },
    preload() { return this; },
  };
}

async function load(data: Uint8Array, draco?: unknown): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  if (draco) loader.setDRACOLoader(draco as any);
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, '');
  return gltf.scene;
}

describe('glTF', () => {
  it('writes GLB that three.js reads back, without hidden objects', async () => {
    const r = await exportGltf(scene(), { name: 'parts' });
    expect(r.file.name).toBe('parts.glb');
    expect(r.stats).toMatchObject({ meshes: 2, primitives: 2, compressed: 0 });
    const g = await load(r.file.data);
    const ball = g.getObjectByName('Ball') as THREE.Mesh;
    expect(ball.position.x).toBe(2);
    expect((ball.material as THREE.MeshStandardMaterial).color.r).toBeCloseTo(1);
    expect(g.getObjectByName('Box')).toBeTruthy();
    let meshes = 0;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    expect(meshes).toBe(2);
  });

  it('writes text glTF with the data inline', async () => {
    const r = await exportGltf(scene(), { binary: false });
    expect(r.file.name).toBe('scene.gltf');
    const json = JSON.parse(new TextDecoder().decode(r.file.data));
    expect(json.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    // three.js fetches data URIs with browser APIs; the buffer is put back in a GLB to read it here.
    const bin = Uint8Array.from(Buffer.from(json.buffers[0].uri.split(',')[1], 'base64'));
    expect(bin.length).toBe(json.buffers[0].byteLength);
    delete json.buffers[0].uri;
    const g = await load(writeGlb(json, bin));
    expect(g.getObjectByName('Ball')).toBeTruthy();
  });

  it('compresses meshes with Draco, which a Draco decoder reads back', async () => {
    const plain = await exportGltf(scene());
    const r = await exportGltf(scene(), { draco: true });
    expect(r.stats.compressed).toBe(2);
    expect(r.file.data.length).toBeLessThan(plain.file.data.length / 2);
    const { json } = readGlb(r.file.data);
    expect(json.extensionsRequired).toContain('KHR_draco_mesh_compression');
    // Only the Draco data is left in the buffer.
    expect(json.bufferViews).toHaveLength(2);
    const g = await load(r.file.data, await dracoLoader());
    const ball = g.getObjectByName('Ball') as THREE.Mesh;
    ball.geometry.computeBoundingBox();
    expect(ball.geometry.boundingBox!.max.x).toBeCloseTo(1, 2);
    expect(ball.geometry.getAttribute('normal')).toBeTruthy();
    expect(ball.geometry.getAttribute('uv')).toBeTruthy();
  });

  it('leaves primitives with morph targets uncompressed', async () => {
    const s = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    geometry.morphAttributes.position = [geometry.getAttribute('position').clone()];
    s.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    s.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()));
    const r = await exportGltf(s, { draco: true });
    expect(r.stats.compressed).toBe(1);
    expect(r.warnings.join()).toContain('1 primitives were left uncompressed');
  });
});
