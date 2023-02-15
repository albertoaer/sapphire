import * as sapp from '../parser/sapp.ts';
import * as wasm from '../wasm/module.ts';
export * as sapp from '../parser/sapp.ts';
export * as wasm from '../wasm/module.ts';
export * as parser from '../parser/parser.ts';
import { CompilerError } from '../wasm/common.ts';

export function convertToWasmType(orig: sapp.Type): wasm.WasmType {
  if (orig.attrs?.array !== undefined) return wasm.WasmType.I32;
  switch (orig.base) {
    case 'string': return wasm.WasmType.I32;
    case 'bool': return wasm.WasmType.I32;
    case 'i32': return wasm.WasmType.I32;
    case 'i64': return wasm.WasmType.I64;
    case 'f32': return wasm.WasmType.F32;
    case 'f64': return wasm.WasmType.F64;
    case 'void': throw new CompilerError('Trying to represent void');
  }
  throw new CompilerError(`Type not handled ${orig.toString()}`)
}