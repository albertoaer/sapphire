import { CompilerError } from '../errors.ts';
import { encodeString, encodeVector, unsignedLEB128 } from "./encoding.ts";
import { WasmExpression } from './expressions.ts';

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
  I64 = 0x7E,
  F32 = 0x7D,
  F64 = 0x7C,
  V128 = 0x7B,
  Funcref = 0x70,
  Externref = 0x6F
}

export type WasmDeclaredType = {
  readonly input: WasmType[],
  readonly output: WasmType[]
}

export class WasmFunction {
  private _body: {
    code: Uint8Array,
    locals: WasmType[]
  } | null = null;

  constructor(public readonly funcIdx: number, public readonly typeIdx: number) { }
  
  set body(data: { code: Uint8Array | WasmExpression, locals?: WasmType[] } | Uint8Array | WasmExpression) {
    if (this._body) throw new CompilerError('Wasm', 'Trying to set body twice to a function');
    if (data instanceof Uint8Array) this._body = { code: data, locals: [] };
    else if (data instanceof WasmExpression) this._body = { code: data.code, locals: [] };
    else this._body = {
      code: data.code instanceof WasmExpression ? data.code.code : data.code, locals: data.locals ?? []
    };
  }

  get body(): Exclude<WasmFunction['_body'], null> {
    if (this._body) return this._body;
    throw new CompilerError('Wasm', 'Undefined function code');
  }

  get completed(): boolean {
    return !!this._body;
  }
}

export type WasmImport = {
  readonly mod: string,
  readonly name: string,
  readonly typeIdx: number
}

export type WasmExport = {
  readonly funcIdx: number,
  readonly name: string
}

export type WasmTable = {
  readonly refType: WasmType.Funcref | WasmType.Externref,
  readonly count: number
}

export type WasmElem = {
  funcIdxVec: number[],
  table: number
}

export type WasmMemoryConfig = {
  import?: { mod: string, name: string },
  limits: { min: number, max?: number },
  exportAs?: string,
}

function section(section: WasmSection, data: number[]): number[] {
  return [section, ...(unsignedLEB128(data.length)), ...data];
}

export class WasmModule {
  private readonly types: WasmDeclaredType[] = [];
  private readonly functions: WasmFunction[] = [];
  private readonly imports: WasmImport[] = [];
  private readonly exports: WasmExport[] = [];
  private readonly tables: WasmTable[] = [];
  private readonly elems: WasmElem[] = [];
  private memoryConfig?: WasmMemoryConfig;
  private mainFunction: number | undefined;
  private lockedImports = false;

  constructor() { }

  get code(): Uint8Array {
    return Uint8Array.from([
      ...magicModuleHeader,
      ...wasmVersion,
      ...this.getTypes(),
      ...this.getImports(),
      ...this.getFunctions(),
      ...this.getTables(),
      ...this.getMemory(),
      ...this.getExports(),
      ...this.getStart(),
      ...this.getElems(),
      ...this.getFunctionsCode()
    ]);
  }

  private getTypes(): number[] {
    if (!this.functions) return [];
    return section(WasmSection.Type, encodeVector(this.types.map(
      x => [0x60, encodeVector(x.input), encodeVector(x.output)]
    )));
  }

  private generateType(tp: WasmDeclaredType): number {
    const idx = this.types.findIndex(
      x =>
      x.input.length === tp.input.length && x.input.every((v, i) => v === tp.input[i]) &&
      x.output.length === tp.output.length && x.output.every((v, i) => v === tp.output[i])
    );
    return idx >= 0 ? idx : this.types.push(tp) - 1;
  }

  private getImports(): number[] {
    if (!this.imports) return [];
    const imports = this.imports.map(
      x => [...encodeString(x.mod), ...encodeString(x.name), WasmExportIndex.Function, x.typeIdx]
    );
    if (this.memoryConfig?.import) {
      const limits = this.memoryConfig.limits;
      imports.push([
        ...encodeString(this.memoryConfig.import.mod),
        ...encodeString(this.memoryConfig.import.name),
        WasmExportIndex.Memory,
        ...(limits.max ? [1, limits.min, limits.max] : [0, limits.min])
      ]);
    }
    return section(WasmSection.Import, encodeVector(imports));
  }

  private getFunctions(): number[] {
    if (!this.functions) return [];
    return section(WasmSection.Function,
      encodeVector(this.functions.map(x => unsignedLEB128(x.typeIdx)))
    );
  }

  private getTables(): number[] {
    if (!this.tables) return [];
    return section(WasmSection.Table, encodeVector(this.tables.map(x => {
      return [x.refType, 0, x.count]
    })));
  }

  private getMemory(): number[] {
    if (!this.memoryConfig || this.memoryConfig?.import) return [];
    const limits = this.memoryConfig.limits;
    return section(WasmSection.Memory, encodeVector([limits.max ? [1, limits.min, limits.max] : [0, limits.min]]));
  }
  
  private getFunctionsCode(): number[] {
    if (!this.functions) return [];
    return section(WasmSection.Code, encodeVector(this.functions.map(
      x => encodeVector([...encodeVector(x.body.locals), ...x.body.code, 0x0b])
    )));
  }

  private getElems(): number[] {
    if (!this.elems) return [];
    return section(WasmSection.Element, encodeVector(this.elems.map(
      x => [2, ...unsignedLEB128(x.table), 0x41, 0, 0x0b, 0x00, ...encodeVector(x.funcIdxVec)]
    )));
  }
  
  private getExports(): number[] {
    if (!this.exports) return [];
    const exports = this.exports.map(
      x => [...encodeString(x.name), WasmExportIndex.Function, ...unsignedLEB128(x.funcIdx)]
    );
    if (this.memoryConfig?.exportAs)
      exports.push([...encodeString(this.memoryConfig.exportAs), WasmExportIndex.Memory, 0])
    return section(WasmSection.Export, encodeVector(exports));
  }

  private getStart(): number[] {
    if (this.mainFunction === undefined) return [];
    return section(WasmSection.Start, [this.mainFunction]);
  }

  import(mod: string, name: string, input: WasmType[], output: WasmType[]): number {
    if (this.lockedImports) throw new CompilerError('Wasm', 'Imports are locked after definitions');
    const typeIdx = this.generateType({ input, output });
    this.imports.push({ mod, name, typeIdx });
    return typeIdx;
  }

  define(
    input: WasmType[], output: WasmType[], options?: { main?: boolean, export?: string }
  ): WasmFunction {
    const typeIdx = this.generateType({ input, output });
    const funcIdx = this.imports.length + this.functions.length;
    const func: WasmFunction = new WasmFunction(funcIdx, typeIdx);
    this.functions.push(func);
    if (options) {
      if (options.main) {
        if (this.mainFunction === undefined) this.mainFunction = funcIdx;
        else throw new CompilerError('Wasm', 'There is already a main function');
      }
      if (options.export) this.exports.push({ funcIdx, name: options.export });
    }
    this.lockedImports = true;
    return func;
  }

  export(name: string, funcIdx: number) {
    this.exports.push({ name, funcIdx });
  }

  table(functions: number[]): number {
    const table = this.tables.length;
    this.tables.push({ count: functions.length, refType: WasmType.Funcref });
    this.elems.push({ funcIdxVec: functions, table });
    return table;
  }

  configureMemory(memoryConfig: WasmMemoryConfig) {
    if (this.memoryConfig) throw new CompilerError('Wasm', 'Memory already defined');
    this.memoryConfig = memoryConfig;
  }
}