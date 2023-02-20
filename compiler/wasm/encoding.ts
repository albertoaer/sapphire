import { write as ieee754Write } from "https://deno.land/x/ieee754@1.2.0/mod.ts";
import { Leb128 } from "https://deno.land/x/leb128@0.1.0/mod.ts";

export function ieee754(value: number, bits: 32 | 64): number[] {
  const buffer = new Uint8Array(bits/8);
  ieee754Write(buffer, value, 0, true, bits == 32 ? 23 : 52, bits/8);
  return Array.from(buffer);
}

export function encodeString(str: string): Uint8Array {
  const encoded = new TextEncoder().encode(str);
  return Uint8Array.from([ encoded.length, ...encoded ]);
}

export const signedLEB128 = (value: number): number[] => Array.from(Leb128.signed.encode(value));

export const unsignedLEB128 = (value: number): number[] => Array.from(Leb128.unsigned.encode(value));

type ValueOrArray<T> = T | ValueOrArray<T>[];

export const encodeVector = (vec: ValueOrArray<number>[], maxDepth = 20): number[] =>
  [ ...unsignedLEB128(vec.length), ...(vec as number[]).flat(maxDepth) ];