# Format and limits

## What is written

- Meshes, lines and points, with their transforms and hierarchy, lights, cameras and animation clips.
- Physically based materials and their textures, as three.js's GLTFExporter writes them.
- With Draco, every triangle primitive with positions, normals, texture coordinates and colours is compressed, and the data it replaces is left out of the file.

## Units and orientation

glTF is in metres and Y up, like three.js, so nothing is converted.

## Limits

Primitives with morph targets, skinning or other attributes are left uncompressed, with a warning. Viewers need a Draco decoder to open compressed files; three.js's DRACOLoader, Blender and most web viewers have one. In Node, textures need a canvas implementation, as GLTFExporter draws them to encode them.
