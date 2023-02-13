import { CompilerError } from './common.ts';
import * as encoding from "./encoding.ts";

export const magicModuleHeader = [0x00, 0x61, 0x73, 0x6d];
export const wasmVersion = [1, 0, 0, 0];

export enum WasmSection {
  Custom,
  Type,
  Import,
  Function,
  Table,
  Memory,
  Global,
  Export,
  Start,
  Element,
  Code,
  Data,
  DataCount
}

export enum WasmExportIndex {
  Function,
  Table,
  Memory,
  Global
}

export enum WasmType {
  I32 = 0x7F,
  I64,
  F32,
  F64,
  V128,
  Funcref,
  Externref
}

export type WasmFunction = {
  code: Uint8Array | null,
  input: WasmType[],
  output: WasmType[]
}

export type WasmImport = {
  mod: string,
  name: string,
  input: WasmType[],
  output: WasmType[]
}

export type WasmExport = {
  id: number,
  name: string
}

function section(section: WasmSection, data: number[]): number[] {
  return [section, ...(encoding.unsignedLEB128(data.length)), ...data];
}

export class WasmModule {
  private readonly functions: (WasmFunction | WasmImport)[] = [];
  private readonly exportedFunctions: WasmExport[] = [];
  private mainFunction: number | undefined;
  
  get code(): Uint8Array {
    return Uint8Array.from([
      ...magicModuleHeader,
      ...wasmVersion,
      ...this.getTypes(),
      ...this.getImports(),
      ...this.getFunctions(),
      ...this.getExports(),
      ...this.getStart(),
      ...this.getFunctionsCode()
    ]);
  }

  private getTypes(): number[] {
    if (!this.functions.length) return [];
    return section(WasmSection.Type, encoding.encodeVector(this.functions.map(
      x => [0x60, encoding.encodeVector(x.input), encoding.encodeVector(x.output)]
    )));
  }

  private getImports(): number[] {
    const imports = this.functions.map((x, idx) => 'mod' in x ? { ...x, idx } : null).filter(x => x !== null);
    if (imports.length === 0) return [];
    return section(WasmSection.Import, encoding.encodeVector(imports.map(
      x => [...encoding.encodeString(x!.mod), ...encoding.encodeString(x!.name), WasmExportIndex.Function, x!.idx]
    )));
  }

  private getFunctions(): number[] {
    const functions = this.functions.map((x, idx) => 'code' in x ? idx : null).filter(x => x !== null);
    if (functions.length === 0) return [];
    return section(WasmSection.Function, encoding.encodeVector(functions.map(x => encoding.unsignedLEB128(x!))));
  }
  
  private getFunctionsCode(): number[] {
    const functions = this.functions.map(x => 'code' in x ? x : null).filter(x => x !== null);
    if (!functions.length) return [];
    return section(WasmSection.Code, encoding.encodeVector(functions.map(x => {
      if (x!.code === null) throw new CompilerError('Undefined function code');
      return encoding.encodeVector([...encoding.encodeVector([]), ...x!.code, 0x0b]);
    })));
  }
  
  private getExports(): number[] {
    if (!this.exportedFunctions.length) return [];
    return section(WasmSection.Export, encoding.encodeVector(this.exportedFunctions.map(
      x => [...encoding.encodeString(x.name), WasmExportIndex.Function, ...encoding.signedLEB128(x.id)]
    )));
  }

  private getStart(): number[] {
    if (this.mainFunction === undefined) return [];
    return section(WasmSection.Start, [this.mainFunction]);
  }

  import(mod: string, name: string, input: WasmType[], output: WasmType[]): number {
    const id = this.functions.length;
    this.functions.push({ mod, name, input, output });
    return id;
  }

  define(input: WasmType[], output: WasmType[], options?: { main?: boolean, export?: string }): number {
    const id = this.functions.length;
    this.functions.push({ code: null, input, output });
    if (options) {
      if (options.main) {
        if (this.mainFunction === undefined) this.mainFunction = id;
        else throw new CompilerError('There is already a main function');
      }
      if (options.export) this.exportedFunctions.push({ id, name: options.export });
    }
    return id;
  }

  setCode(id: number, code: number[] | Uint8Array) {
    if (id < 0 || id >= this.functions.length) throw new CompilerError('Trying to set code to an invalid function');
    const obj = this.functions[id];
    if (!('code' in obj)) throw new CompilerError('Can not set code to non module function');
    if (obj.code !== null) throw new CompilerError('Trying to set code twice to a function');
    obj.code = Array.isArray(code) ? new Uint8Array(code) : code;
  }
}