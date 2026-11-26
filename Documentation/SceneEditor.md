# Using it in SceneEditor

[SceneEditor](https://github.com/VJigouline/SceneEditor) saves scenes with mc-gltf-export from the **Scene** tab: choose the format under **Select output format**, then **Save Scene**. The **glTF binary (glb)** format, the default, writes one compact file that SceneEditor and most 3D programs open. **glTF text (gltf)** writes readable JSON with the data inline. **glTF with Draco compression (glb)** compresses meshes with the Draco encoder SceneEditor serves; SceneEditor opens these files again with its Draco decoder.

The transform gizmo and light helpers are left out. Warnings, such as objects the format can't hold, go to the browser console, and a scene that can't be saved gives a **Failure** message.
