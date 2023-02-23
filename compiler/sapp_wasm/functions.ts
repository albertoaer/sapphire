import { sapp, wasm, convertToWasmType } from "./common.ts";
import { CompilerError, FeatureError } from "../errors.ts";
import { WasmType } from "../wasm/module.ts";

export type ResolvedFunction = number | Uint8Array

export interface FunctionResolutor {
  useFunc(func: sapp.Func): ResolvedFunction;
  useFuncTable(funcs: sapp.Func[]): number;
}

export class FunctionManager implements FunctionResolutor {
  private readonly defined: sapp.Func[] = [];

  private readonly functions: Map<sapp.Func, wasm.WasmFunction> = new Map();
  private readonly instanceFunctions: Map<sapp.Func[], number> = new Map();
  
  constructor(private readonly module: wasm.WasmModule) { }

  useFunc(func: sapp.Func): ResolvedFunction {
    if (typeof func.source === 'number') throw new FeatureError(null, 'Native Functions');
    if (!this.functions.has(func)) {
      this.functions.set(func, this.module.define(
        [...(func.struct ? [WasmType.I32] : []), ...func.inputSignature.map(convertToWasmType)],
        func.outputSignature.base === 'void' ? [] : [convertToWasmType(func.outputSignature)]
      ));
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

  [Symbol.iterator](): Iterator<sapp.Func> {
    let i = 0;
    return {
      next: (): { done: boolean, value: sapp.Func } => {
        while (this.functions.get(this.defined[i])!.completed) i++;
        return { done: i >= this.defined.length, value: this.defined[i++] }
      }
    }
  } 
}