import { CompilerError } from '../errors.ts';
import { sapp, wasm, convertToWasmType } from './common.ts';
import type { FunctionResolutor } from './functions.ts';
import { MemoryHelper } from './memory.ts';

export class LocalsInfo {
  private readonly aux: [wasm.WasmType, boolean][] = [];
  private readonly localsBaseSize: number;

  constructor(private readonly locals: wasm.WasmType[]) {
    this.localsBaseSize = locals.length;
  }

  requireAux(tp: wasm.WasmType): number {
    for (let i = 0; i < this.aux.length; i++) {
      if (this.aux[i][0] == tp && !this.aux[i][1]) {
        this.aux[i][1] = true;
        return i + this.locals.length;
      }
    }
    this.aux.push([tp, true]);
    return this.locals.push(tp) - 1;
  }

  freeAux(idx: number) {
    this.aux[idx - this.localsBaseSize][1] = false;
  }

  at(idx: number): wasm.WasmType | undefined {
    return this.locals[idx];
  }
}

export class ExpressionCompiler {
  public readonly expression = new wasm.WasmExpression();
  private readonly locals: LocalsInfo;

  constructor(
    private readonly resolutor: FunctionResolutor,
    locals: wasm.WasmType[] | LocalsInfo,
    private readonly memory: MemoryHelper
  ) {
    if (locals instanceof LocalsInfo) this.locals = locals;
    else this.locals = new LocalsInfo(locals);
  }

  private fastProcess(ex: sapp.Expression): wasm.WasmExpression {
    const comp = new ExpressionCompiler(this.resolutor, this.locals, this.memory);
    comp.submit(ex);
    return comp.expression;
  }

  private processCall({ args, func }: sapp.Expression & { id: 'call' }) {
    const resolved = this.resolutor.useFunc(func);
    if (typeof resolved !== 'number') {
      const argsTransformed = resolved.reverseStack ? args.reverse() : args;
      if (resolved.preCode) this.expression.pushRaw(...resolved.preCode);
      for (const arg of argsTransformed) this.expression.pushExpr(this.fastProcess(arg));
      if (resolved.postCode) this.expression.pushRaw(...resolved.postCode);
    } else {
      for (const arg of args) this.expression.pushExpr(this.fastProcess(arg));
      this.expression.pushRaw(0x10);
      this.expression.pushNumber(resolved, 'uint', 32);
    }
  }

  private processIf(ex: sapp.Expression & { id: 'if' }) {
    this.expression.pushIf(
      this.fastProcess(ex.cond),
      ex.then.type.isVoid ? null : convertToWasmType(ex.then.type),
      this.fastProcess(ex.then),
      this.fastProcess(ex.else)
    );
  }

  private pushLiteral({ type, value }: sapp.Literal) {
    switch (type) {
      case 'string':
        this.allocateString(value);
        break;
      case 'bool':
        this.expression.pushRaw(0x41, value === 'true' ? 1 : 0);
        break;
      case 'i32':
        this.expression.pushRaw(0x41).pushNumber(Number(value), 'int', 32);
        break;
      case 'i64':
        this.expression.pushRaw(0x42).pushNumber(Number(value), 'int', 64);
        break;
      case 'f32':
        this.expression.pushRaw(0x43).pushNumber(Number(value), 'float', 32);
        break;
      case 'f64':
        this.expression.pushRaw(0x44).pushNumber(Number(value), 'float', 64);
        break;
    }
  }

  private processStack(exs: sapp.Expression[]) {
    for (let i = 0; i < exs.length - 1; i++) {
      this.submit(exs[i]);
      if (!exs[i].type.isVoid)
        this.expression.pushRaw(0x1A); // drop
    }
    this.submit(exs[exs.length-1]);
  }

  private paramGet(name: number) {
    this.expression.pushRaw(0x20, name);
  }

  private allocateString(value: string) {
    const encoded = wasm.encodings.encodeString(value);
    const getAddress = this.memory.allocate(encoded.length);
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    this.expression.pushExpr(getAddress).pushRaw(0x22, aux, 0x20, aux);
    this.expression.pushExpr(this.memory.copyBuffer(encoded, aux));
    this.locals.freeAux(aux);
  }

  private allocateList(exprs: sapp.Expression[]) {
    const tp = convertToWasmType(exprs[0].type);
    const sz = wasm.WasmTypeBytes[tp];
    if (sz === undefined) throw new CompilerError('Wasm', 'Cannot compute undefined size');
    const getAddress = this.memory.allocate(sz * exprs.length);
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    this.expression.pushExpr(getAddress).pushRaw(0x22, aux, 0x20, aux);
    this.expression.pushExpr(this.memory.copySame(exprs.map(x => this.fastProcess(x)), tp, aux));
    this.locals.freeAux(aux);
  }

  private allocateTuple(exprs: sapp.Expression[]) {
    let sz = 0;
    const mapped: [wasm.WasmExpression, wasm.WasmType][] = [];
    for (const expr of exprs) {
      const tp = convertToWasmType(expr.type);
      mapped.push([this.fastProcess(expr), tp]);
      const tempsz = wasm.WasmTypeBytes[tp];
      if (tempsz === undefined) throw new CompilerError('Wasm', 'Cannot compute undefined size');
      sz += tempsz;
    }
    const getAddress = this.memory.allocate(sz);
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    this.expression.pushExpr(getAddress).pushRaw(0x22, aux, 0x20, aux);
    this.expression.pushExpr(this.memory.copy(mapped, aux));
    this.locals.freeAux(aux);
  }

  submit(ex: sapp.Expression) {
    switch (ex.id) {
      case 'call': 
        this.processCall(ex);
        break;
      case 'if':
        this.processIf(ex);
        break;
      case 'literal':
        this.pushLiteral(ex.value);
        break;
      case 'group':
        this.processStack(ex.exprs);
        break;
      case 'param_get':
        this.paramGet(ex.name);
        break;
      case 'list_literal':
        this.allocateList(ex.exprs);
        break;
      case 'tuple_literal':
        this.allocateTuple(ex.exprs);
        break;
      case 'none':
        break;
      default:
        throw new CompilerError('Wasm', `Expression compilation not provided for ${ex.id}`);
    }
  }
}