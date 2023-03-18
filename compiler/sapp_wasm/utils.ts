import { encodings } from '../wasm/mod.ts';

export function duplicate(aux: number): Uint8Array {
  return new Uint8Array([0x22, aux, 0x20, aux]);
}

export function getLow32(): Uint8Array {
  return new Uint8Array([0xA7]);
}

export function getHigh32(): Uint8Array {
  return new Uint8Array([0x42, 32, 0x87]);
}

/**
 * This function expects the data pointer to be in the stack
 */
export function buildStructuredType(vtable: number): Uint8Array {
  return new Uint8Array([0xAD, 0x42, 32, 0x86, 0x42, ...encodings.signedLEB128(vtable), 0x84]);
}