# API

## `exportGltf(root, options?)`

Writes `.glb` or `.gltf` and returns a promise of a `GltfExportResult`.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `binary` | true | Binary GLB; `false` writes text glTF with the binary data inline. |
| `draco` | false | `true`, or settings: `encoder` (a Draco encoder module), `quantization` (bits for position, normal, uv and color; 14, 10, 12 and 8 by default) and `speed` (0 to 10, default 5). |
| `onlyVisible` | true | Leaves out hidden objects. |
| `maxTextureSize` | 4096 | Largest texture side, in pixels. |
| `animations` | [] | Animation clips to include. |
| `name` | 'scene' | The file's name, without extension. |

### `GltfExportResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `file` | `ExportFile` | `name`, `data` (a `Uint8Array`) and `mimeType`. |
| `stats` | object | Meshes, primitives, compressed primitives and bytes. |
| `warnings` | `string[]` | What was left out, and why. |

`ExportFile` is `{ name, data, mimeType }`, with `data` a `Uint8Array`.

`root` may also be a list of objects, such as a scene's children without its helpers. In Node, draco3d's encoder is loaded when first needed. In browsers, `createDracoEncoder(source)` makes the encoder from the text of Google's draco_encoder.js.

See the package's `index.d.ts` for every exported type and helper.
