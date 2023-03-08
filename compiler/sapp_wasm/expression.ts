import { CompilerError, FeatureError } from '../errors.ts';
import { sapp, wasm, convertToWasmType } from './common.ts';
import type { FunctionResolutor } from './functions.ts';
import { MemoryHelper } from './memory.ts';

export class ExpressionCompiler {
  public readonly expression = new wasm.WasmExpression();

  constructor(private readonly resolutor: FunctionResolutor, private readonly memory: MemoryHelper) { }

  private fastProcess(ex: sapp.Expression): wasm.WasmExpression {
    const comp = new ExpressionCompiler(this.resolutor, this.memory);
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
      case 'string': throw new FeatureError(null, 'Strings');
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

  private allocateList(exprs: sapp.Expression[]) {
    const sz = wasm.WasmTypeBytes[convertToWasmType(exprs[0].type)];
    if (sz === undefined) throw new CompilerError('Wasm', 'Cannot compute undefined size');
    this.expression.pushRaw(...this.memory.allocate(sz * exprs.length));
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
      case 'none':
        break;
      default:
        throw new CompilerError('Wasm', `Expression compilation not provided for ${ex.id}`);
    }
  }
}