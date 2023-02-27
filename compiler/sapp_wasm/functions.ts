import { sapp, wasm, convertToWasmType, ResolvedFunction, FunctionInjector } from "./common.ts";
import { CompilerError } from "../errors.ts";
import { WasmType } from "../wasm/module.ts";

export interface FunctionResolutor {
  useFunc(func: sapp.Func): ResolvedFunction;
  useFuncTable(funcs: sapp.Func[]): number;
}

function signatureOf(func: sapp.Func): [WasmType[], WasmType[]] {
  return [
    [...(func.struct ? [WasmType.I32] : []), ...func.inputSignature.map(convertToWasmType)],
    func.outputSignature.isVoid ? [] : [convertToWasmType(func.outputSignature)]
  ];
}

export class FunctionManager implements FunctionResolutor {
  private readonly defined: sapp.Func[] = [];

  private readonly functions: Map<sapp.Func, wasm.WasmFunction> = new Map();
  private readonly imports: Map<sapp.Func, number> = new Map();
  private readonly instanceFunctions: Map<sapp.Func[], number> = new Map();
  
  constructor(private readonly module: wasm.WasmModule, private readonly injector: FunctionInjector) { }

  private tryUseImport(func: sapp.Func): ResolvedFunction | undefined {
    if (Array.isArray(func.source) && func.source.length === 2) {
      if (!this.imports.has(func)) {
        const signature = signatureOf(func);
        this.imports.set(func, this.module.import(func.source[0], func.source[1], signature[0], signature[1]));
      }
      return this.imports.get(func);
    }
  }

  useFunc(func: sapp.Func): ResolvedFunction {
    if (sapp.isFunctionReference(func.source)) {
      const injected = this.injector.get(func.source) ?? this.tryUseImport(func);
      if (injected === undefined)
        throw new CompilerError('Wasm', 'Unknown reference function code: ' + func.source);
      return injected;
    }
    if (!this.functions.has(func)) {
      if (func.dependsOn)
      for (const x of func.dependsOn)
        if (Array.isArray(x)) this.useFuncTable(x);
        else this.useFunc(x);

      const signature = signatureOf(func);
      this.functions.set(func, this.module.define(signature[0], signature[1]));
      this.defined.push(func);
    }
    return this.functions.get(func)!.funcIdx;
  }

  useFuncTable(funcs: sapp.Func[]): number {
    if (!this.instanceFunctions.has(funcs)) {
      const resolved = funcs.map(this.useFunc.bind(this));
      if (resolved.find(x => typeof x !== 'number'))
        throw new CompilerError('Wasm', 'Tables are made up of pure functions');
      const table = this.module.table(resolved as number[]);
      this.instanceFunctions.set(funcs, table);
    }
    return this.instanceFunctions.get(funcs)!;
  }

  setBody(func: sapp.Func, code: Uint8Array) {
    const fn = this.functions.get(func);
    if (!fn) throw new CompilerError('Wasm', 'Trying to set code to undefined function');
    fn.body = { locals: func.locals ? func.locals.map(convertToWasmType) : [], code };
  }

  insertDef(def: sapp.Def) {
    Object.values(def.funcs).forEach(f => f.forEach(f => this.useFunc(f)));
    Object.values(def.instanceFuncs).forEach(f => f.forEach(f => this.useFuncTable(f)));
  }

  getFunc(func: sapp.Func): wasm.WasmFunction | undefined {
    return this.functions.get(func);
  }

  [Symbol.iterator](): Iterator<sapp.Func> {
    let i = 0;
    return {
      next: (): { done: boolean, value: sapp.Func } => {
        while (this.defined[i] !== undefined && this.functions.get(this.defined[i])!.completed) i++;
        return { done: i >= this.defined.length, value: this.defined[i++] }
      }
    }
  } 
}