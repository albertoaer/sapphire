import { sapp, wasm, convertToWasmType } from './common.ts';
import { CompilerError } from '../errors.ts';
import type { FunctionResolutor } from './functions.ts';
import { MemoryHelper } from './memory.ts';
import { Locals } from './locals.ts';
import { buildStructuredType, duplicate, getLow32 } from './utils.ts';

export class ExpressionCompiler {
  public readonly expression = new wasm.WasmExpression();

  constructor(
    private readonly resolutor: FunctionResolutor,
    private readonly locals: Locals,
    private readonly memory: MemoryHelper
  ) { }

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

  private processCallInstanced({ args, func, owner }: sapp.Expression & { id: 'call_instanced' }) {
    const resolved = this.resolutor.useFuncTable(func);
    for (const arg of args) this.expression.pushExpr(this.fastProcess(arg));
    const aux = this.locals.requireAux(wasm.WasmType.I64);
    this.expression.pushExpr(this.fastProcess(owner)).pushRaw(
      ...duplicate(this.locals.wrap(aux)),
      ...getLow32(), 0x11,
      ...wasm.encodings.unsignedLEB128(resolved.typeIdx), ...wasm.encodings.unsignedLEB128(resolved.tableIdx)
    );
    this.locals.freeAux(aux);
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
    this.expression.pushExpr(getAddress).pushRaw(...duplicate(this.locals.wrap(aux)));
    this.expression.pushExpr(this.memory.copyBuffer(encoded, this.locals.wrap(aux)));
    this.locals.freeAux(aux);
  }

  private allocateList(exprs: sapp.Expression[]) {
    const tp = convertToWasmType(exprs[0].type);
    const sz = wasm.WasmTypeBytes[tp];
    if (sz === undefined) throw new CompilerError('Wasm', 'Cannot compute undefined size');
    const getAddress = this.memory.allocate(sz * exprs.length);
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    this.expression.pushExpr(getAddress).pushRaw(...duplicate(this.locals.wrap(aux)));
    this.expression.pushExpr(this.memory.copySame(exprs.map(x => this.fastProcess(x)), tp, this.locals.wrap(aux)));
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
    this.expression.pushExpr(getAddress).pushRaw(...duplicate(this.locals.wrap(aux)));
    this.expression.pushExpr(this.memory.copy(mapped, this.locals.wrap(aux)));
    this.locals.freeAux(aux);
  }

  private build(data: sapp.Expression[], tableIdx: number) {
    this.allocateTuple(data);
    this.expression.pushRaw(...buildStructuredType(tableIdx))
  }

  submit(ex: sapp.Expression) {
    switch (ex.id) {
      case 'call': 
        this.processCall(ex);
        break;
      case 'call_instanced':
        this.processCallInstanced(ex);
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
      case 'build':
        this.build(ex.args, ex.structIdx);
        break;
      case 'none':
        break;
      default:
        throw new CompilerError('Wasm', `Expression compilation not provided for ${ex.id}`);
    }
  }
}