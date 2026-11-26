// draco3d ships no types; the encoder module is typed in draco.ts.

declare module 'draco3d/draco_encoder_nodejs.js' {
  const createEncoderModule: (options?: object) => Promise<unknown>;
  export default createEncoderModule;
}

declare module 'draco3d/draco_decoder_nodejs.js' {
  const createDecoderModule: (options?: object) => Promise<unknown>;
  export default createDecoderModule;
}
