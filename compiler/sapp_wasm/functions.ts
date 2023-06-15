import { sapp, wasm, convertToWasmType, ResolvedFunction, FunctionTableInfo, FunctionInjector } from "./common.ts";
import { CompilerError } from "../errors.ts";
import { Locals, DefaultLocals } from './locals.ts';

export interface FunctionResolutor {
  useFunc(func: sapp.Func): ResolvedFunction;
  useFuncTable(funcs: sapp.Func[]): FunctionTableInfo;
}

function signatureOf(func: sapp.Func): [wasm.WasmType[], wasm.WasmType[]] {
  return [
    func.inputSignature.map(convertToWasmType),
    func.outputSignature.isVoid ? [] : [convertToWasmType(func.outputSignature)]
  ];
}

export class FunctionBind {
  constructor(
    private readonly func: sapp.Func<[sapp.Expression]>,
    private readonly wfunc: wasm.WasmFunction,
    private readonly signature: [wasm.WasmType[], wasm.WasmType[]]
  ) { }

  build(apply: (expr: sapp.Expression, locals: Locals) => Uint8Array) {
    const locals = new DefaultLocals(
      this.func.locals ? this.func.locals.map(convertToWasmType) : [],
      this.signature[0].length
    );
    const code = apply(this.func.source[0], locals);
    this.wfunc.body = { locals: locals.locals, code };
  }

  get completed(): boolean {
    return this.wfunc.completed;
  }
}

export class FunctionCollector {
  private readonly defined: FunctionBind[] = [];
  private readonly functions: Map<sapp.Func, wasm.WasmFunction | ResolvedFunction> = new Map();
  private functionManager: FunctionManager | undefined;

  constructor(private readonly module: wasm.WasmModule, private readonly injector: FunctionInjector) { }

  get manager(): FunctionManager {
    if (!this.functionManager) this.functionManager = new FunctionManager(this.module, this.functions);
    return this.functionManager;
  }

  private import(func: sapp.Func<sapp.FunctionRoute>): ResolvedFunction {
    if (func.source.length === 2) {
      const signature = signatureOf(func);
      return this.module.import(func.source[0], func.source[1], signature[0], signature[1]);
    }
    throw new CompilerError('Wasm', 'Invalid route to import: ' + func.source.join('.'));
  }

  private useFunc(func: sapp.Func) {
    if (this.functions.has(func)) return;

    if (sapp.isRefFunc(func)) {
      const injected = this.injector.getRef?.(func.source);
      if (injected === undefined) throw new CompilerError('Wasm', 'Cannot treat reference: ' + func.source);
      this.functions.set(func, injected);
    } else if (sapp.isRouteFunc(func))
      this.functions.set(func, this.injector.getRoute?.(func.source) ?? this.import(func));
    else {
      const signature = signatureOf(func);
      const wfunc = this.module.define(signature[0], signature[1]);
      this.functions.set(func, wfunc);
      const castedFunc = func as sapp.Func<[sapp.Expression | undefined]>
      if (castedFunc.source[0] === undefined) throw new CompilerError('Wasm', 'Function does not have body: ' + func);
      this.defined.push(new FunctionBind(castedFunc as sapp.Func<[sapp.Expression]>, wfunc, signature));
    }
    
    // Dependencies are processed after function to prevent loops
    if (func.dependsOn)
      for (const x of func.dependsOn)
        if (Array.isArray(x)) x.map(this.useFunc.bind(this));
        else this.useFunc(x);
  }

  populate(funcs: sapp.Func[]) {
    if (this.functionManager) throw new CompilerError('Wasm', 'Manager already generated');
    funcs.forEach(this.useFunc.bind(this));
  }

  [Symbol.iterator](): Iterator<FunctionBind> {
    let i = 0;
    return {
      next: (): { done: boolean, value: FunctionBind } => {
        while (this.defined[i] !== undefined && this.defined[i].completed) i++;
        return { done: i >= this.defined.length, value: this.defined[i++] }
      }
    }
  }
}

export class FunctionManager implements FunctionResolutor {
  private readonly instanceFunctions: Map<sapp.Func[], FunctionTableInfo> = new Map();
  
  constructor(
    private readonly module: wasm.WasmModule,
    private readonly functions: Map<sapp.Func, wasm.WasmFunction | ResolvedFunction>
  ) { }

  useFunc(func: sapp.Func): ResolvedFunction {
    const resolved = this.functions.get(func);
    if (resolved === undefined) throw new CompilerError('Wasm', 'Trying to use not compiled function');
    return resolved instanceof wasm.WasmFunction ? resolved.funcIdx : resolved;
  }

  useFuncTable(funcs: sapp.Func[]): FunctionTableInfo {
    if (!this.instanceFunctions.has(funcs)) {
      const resolved = funcs.map(this.useFunc.bind(this));
      if (resolved.find(x => typeof x !== 'number'))
        throw new CompilerError('Wasm', 'Tables are made up of pure functions');
      const typeIdx = (this.functions.get(funcs[0]) as wasm.WasmFunction).typeIdx;
      const tableIdx = this.module.table(resolved as number[]);
      this.instanceFunctions.set(funcs, { tableIdx, typeIdx });
    }
    return this.instanceFunctions.get(funcs)!;
  }
}