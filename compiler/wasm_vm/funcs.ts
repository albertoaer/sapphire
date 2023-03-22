import { Buffer } from "https://deno.land/std@0.137.0/node/buffer.ts";
import { Leb128, MockStream } from "https://deno.land/x/leb128@0.1.0/mod.ts";

export function makeStrRef(memory: WebAssembly.Memory): (address: number) => string {
  return (address: number): string => {
    const buffer = new Uint8Array(memory.buffer);
    let start = address;
    let byte;
    do byte = buffer.at(++start)!; while (byte >> 7 !== 0);
    const tam = Leb128.unsigned.readBn(new MockStream(Buffer.from(buffer.slice(address, start)))).toNumber();
    return new TextDecoder().decode(buffer.slice(start, start + tam))
  }
}

export function makeLen(memory: WebAssembly.Memory): (address: number) => number {
  return (address: number): number => {
    const buffer = new Uint8Array(memory.buffer);
    let start = address;
    let byte;
    do byte = buffer.at(++start)!; while (byte >> 7 !== 0);
    return Leb128.unsigned.readBn(new MockStream(Buffer.from(buffer.slice(address, start)))).toNumber();
  }
}