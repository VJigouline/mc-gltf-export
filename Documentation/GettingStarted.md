# Getting started

## Install

```sh
npm install three github:VJigouline/mc-gltf-export
```

## Write a file

`exportGltf(root, options)` writes the scenes under `root`, usually a scene, as `.glb` or `.gltf`. It returns a promise of the result.

```ts
import { exportGltf } from 'mc-gltf-export';

const result = await exportGltf(scene, { name: 'model' });
for (const warning of result.warnings) console.warn(warning);
const file = result.file;

// In a browser, download it:
const link = document.createElement('a');
link.href = URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
link.download = file.name;
link.click();

// In Node, write it:
// fs.writeFileSync(file.name, file.data);
```

## Units and orientation

glTF is in metres and Y up, like three.js, so nothing is converted.

## Options

- **`binary`** (default true): Binary GLB; `false` writes text glTF with the binary data inline.
- **`draco`** (default false): `true`, or settings: `encoder` (a Draco encoder module), `quantization` (bits for position, normal, uv and color; 14, 10, 12 and 8 by default) and `speed` (0 to 10, default 5).
- **`onlyVisible`** (default true): Leaves out hidden objects.
- **`maxTextureSize`** (default 4096): Largest texture side, in pixels.
- **`animations`** (default []): Animation clips to include.
- **`name`** (default 'scene'): The file's name, without extension.

`root` may also be a list of objects, such as a scene's children without its helpers. In Node, draco3d's encoder is loaded when first needed. In browsers, `createDracoEncoder(source)` makes the encoder from the text of Google's draco_encoder.js.

See the [API](API.md) for the whole result.
