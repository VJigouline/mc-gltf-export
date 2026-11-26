# mc-gltf-export

A glTF exporter for [three.js](https://threejs.org/), written in TypeScript. It writes three.js scenes as glTF 2.0 with three.js's GLTFExporter: binary GLB by default, or text glTF with the data inline, optionally with Draco mesh compression (KHR_draco_mesh_compression), which makes meshes several times smaller. It was made for [SceneEditor](https://github.com/VJigouline/SceneEditor), and works in any three.js application.

```ts
import { exportGltf } from 'mc-gltf-export';

const { file } = await exportGltf(scene, { draco: true });
// file.data is a Uint8Array: download it, or write it to disk.
const url = URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
```

## What it writes

- Meshes, lines and points, with their transforms and hierarchy, lights, cameras and animation clips.
- Physically based materials and their textures, as three.js's GLTFExporter writes them.
- With Draco, every triangle primitive with positions, normals, texture coordinates and colours is compressed, and the data it replaces is left out of the file.

Primitives with morph targets, skinning or other attributes are left uncompressed, with a warning. Viewers need a Draco decoder to open compressed files; three.js's DRACOLoader, Blender and most web viewers have one. In Node, textures need a canvas implementation, as GLTFExporter draws them to encode them. See [Format and limits](Documentation/Support.md) for the details.

## Install

The package is not on the npm registry. Install it from GitHub:

```sh
npm install github:VJigouline/mc-gltf-export
```

`three` (r160 or later) is a peer dependency. The package builds itself on install.

## Documentation

- [Getting started](Documentation/GettingStarted.md)
- [API](Documentation/API.md)
- [Format and limits](Documentation/Support.md)
- [Using it in SceneEditor](Documentation/SceneEditor.md)

## Development

```sh
npm install
npm test           # unit tests, with Vitest
npm run typecheck
npm run build      # dist/
```

The tests write files and read them back with three.js's loaders. It needs Node.js 22 or later.

## Licence

[MIT](LICENSE)
