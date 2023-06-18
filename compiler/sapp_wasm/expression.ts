import { sapp, wasm, convertToWasmType } from './common.ts';
import { CompilerError } from '../errors.ts';
import type { FunctionResolutor } from './functions.ts';
import { MemoryHelper } from './memory.ts';
import { Locals } from './locals.ts';
import { buildStructuredType, duplicate, getLow32, getHigh32 } from './utils.ts';

export class ExpressionCompiler {
  public readonly expression = new wasm.WasmExpression();

  constructor(
    private readonly resolutor: FunctionResolutor,
    private readonly locals: Locals,
    private readonly memory: MemoryHelper,
    private readonly depth: number
  ) { }

  private fastProcess(ex: sapp.Expression, new_block = false): wasm.WasmExpression {
    const comp = new ExpressionCompiler(this.resolutor, this.locals, this.memory, this.depth + (new_block ? 1 : 0));
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

  private processTailCall({ args }: sapp.Expression & { id: 'tail_call' }) {
    args.forEach((arg, idx) => this.expression.pushExpr(this.fastProcess(arg)).pushRaw(0x21, idx));
    this.expression.pushRaw(0x0C, this.depth);
  }

  private processIf(ex: sapp.Expression & { id: 'if' }) {
    this.expression.pushIf(
      this.fastProcess(ex.cond),
      ex.then.type.isVoid ? null : convertToWasmType(ex.then.type),
      this.fastProcess(ex.then, true),
      ex.else ? this.fastProcess(ex.else, true) : undefined
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

  private get(name: number, kind: 'param' | 'local') {
    this.expression.pushRaw(0x20, kind === 'param' ? name : this.locals.wrap(name));
  }

  private set(name: number, value: sapp.Expression) {
    this.expression.pushExpr(this.fastProcess(value)).pushRaw(0x21, this.locals.wrap(name));
  }

  private accessIndex(structure: sapp.Expression, idx: number | sapp.Expression) {
    this.expression.pushExpr(this.fastProcess(structure));
    if (structure.type.array) {
      if (typeof idx === 'number')
        this.expression.pushExpr(this.memory.accessConstant(convertToWasmType(structure.type), idx, true));
      else {
        if (!idx.type.isEquals(sapp.I32)) throw new CompilerError('Wasm', 'Expecting I32 kind index');
        this.expression.pushExpr(this.memory.access(convertToWasmType(structure.type), this.fastProcess(idx), true));
      }
    } else {
      const type = structure.type.base;
      if (!Array.isArray(type)) throw new CompilerError('Wasm', 'Trying to access non indexable type');
      if (typeof idx !== 'number') throw new CompilerError('Wasm', 'Struct access must be constant');
      this.expression.pushExpr(this.memory.accessConstant(type.map(convertToWasmType), idx, false));
    }
  }

  private allocateString(value: string) {
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    const encoded = wasm.encodings.encodeString(value);
    this.expression.pushExpr(this.memory.copyBuffer(encoded, this.locals.wrap(aux)));
    this.locals.freeAux(aux);
  }

  private allocateList(exprs: sapp.Expression[]) {
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    const tp = convertToWasmType(exprs[0].type);
    this.expression.pushExpr(
      this.memory.copyArray(exprs.map(x => this.fastProcess(x)), tp, this.locals.wrap(aux))
    );
    this.locals.freeAux(aux);
  }
  
  private allocateTuple(exprs: sapp.Expression[]) {
    const aux = this.locals.requireAux(wasm.WasmType.I32);
    this.expression.pushExpr(
      this.memory.copyTuple(exprs.map(x => [this.fastProcess(x), convertToWasmType(x.type)]), this.locals.wrap(aux))
    );
    this.locals.freeAux(aux);
  }

  private build(data: sapp.Expression[], tableIdx: number) {
    this.allocateTuple(data);
    this.expression.pushRaw(...buildStructuredType(tableIdx))
  }

  private objectDataAddress(expr: sapp.Expression) {
    this.expression.pushExpr(this.fastProcess(expr)).pushRaw(...getHigh32());
  }

  submit(ex: sapp.Expression) {
    switch (ex.id) {
      case 'call': 
        this.processCall(ex);
        break;
      case 'call_instanced':
        this.processCallInstanced(ex);
        break;
      case 'tail_call':
        this.processTailCall(ex);
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
        this.get(ex.name, 'param');
        break;
      case 'local_get':
        this.get(ex.name, 'local');
        break;
      case 'local_set':
        this.set(ex.name, ex.value);
        break;
      case 'access_index':
        this.accessIndex(ex.structure, ex.idx);
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
      case 'object_data':
        this.objectDataAddress(ex.obj);
        break;
      case 'none':
        break;
      default:
        throw new CompilerError('Wasm', `Expression compilation not provided for ${ex.id}`);
    }
  }
}