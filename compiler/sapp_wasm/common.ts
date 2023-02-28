import * as sapp from '../sapp.ts';
import * as wasm from '../wasm/module.ts';
export * as sapp from '../sapp.ts';
export * as wasm from '../wasm/mod.ts';
export * as parser from '../parser/parser.ts';
import { CompilerError } from '../errors.ts';

export function convertToWasmType(orig: sapp.Type): wasm.WasmType {
  if (orig.array !== undefined) return wasm.WasmType.I32;
  switch (orig.base) {
    case 'string': return wasm.WasmType.I32;
    case 'bool': return wasm.WasmType.I32;
    case 'i32': return wasm.WasmType.I32;
    case 'i64': return wasm.WasmType.I64;
    case 'f32': return wasm.WasmType.F32;
    case 'f64': return wasm.WasmType.F64;
    case 'void': throw new CompilerError('Wasm', 'Trying to represent void');
  }
  throw new CompilerError('Wasm', `Type not handled: ${orig.toString()}`)
}

export type ResolvedFunction = number | RawCodeSpec

export type RawCodeSpec = {
  reverseStack: boolean,
  instruction: Uint8Array
}

export interface FunctionInjector {
  getRef?(ref: sapp.FunctionReference): ResolvedFunction | undefined;
  getRoute?(route: sapp.FunctionRoute): ResolvedFunction | undefined;
}