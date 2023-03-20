import { CompilerError } from '../errors.ts';
import { WasmType, WasmExpression, WasmTypeBytes } from '../wasm/mod.ts';
import { duplicate } from './utils.ts';

/**
 * Provide functions to compile memory features of the language
 */
export class MemoryHelper {
  constructor(private readonly allocFn: number) { }

  allocate(tam: number): WasmExpression {
    return new WasmExpression(0x41).pushNumber(tam, 'int', 32).pushRaw(0x10).pushNumber(this.allocFn, 'uint', 32);
  }

  /**
   * This method expects the address to be already in the stack
   */
  writeItem(value: WasmExpression, tp: WasmType): WasmExpression {
    let code: number;
    switch (tp) {
      case WasmType.I32: code = 0x36; break;
      case WasmType.I64: code = 0x37; break;
      case WasmType.F32: code = 0x38; break;
      case WasmType.F64: code = 0x39; break;
      default: throw new CompilerError('Wasm', 'Trying to write unsupported type into memory');
    }
    return new WasmExpression().pushExpr(value).pushRaw(code, 0, 0);
  }

  /**
   * This method expects the address to be already in the stack
   */
  readItem(tp: WasmType): WasmExpression {
    let code: number;
    switch (tp) {
      case WasmType.I32: code = 0x28; break;
      case WasmType.I64: code = 0x29; break;
      case WasmType.F32: code = 0x2A; break;
      case WasmType.F64: code = 0x2B; break;
      default: throw new CompilerError('Wasm', 'Trying to read unsupported type from memory');
    }
    return new WasmExpression(code, 0, 0);
  }

  /**
   * This method expects the address to be already in the stack
   */
  copy(values: [WasmExpression, WasmType][], aux: number): WasmExpression {
    const final = new WasmExpression();
    for (let i = 0; i < values.length; i++) {
      const [expr, tp] = values[i];
      const sz = WasmTypeBytes[tp];
      if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
      if (i < values.length - 1) final.pushRaw(...duplicate(aux));
      final.pushExpr(this.writeItem(expr, tp));
      if (i < values.length - 1) final.pushRaw(0x41).pushNumber(sz, 'int', 32).pushRaw(0x6A);
    }
    return final;
  }

  /**
   * This method expects the address to be already in the stack
   */
  copySame(values: WasmExpression[], tp: WasmType, aux: number): WasmExpression {
    const final = new WasmExpression();
    const sz = WasmTypeBytes[tp];
    if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
    final.pushRaw(...duplicate(aux))
      .pushExpr(this.writeItem(new WasmExpression(0x41).pushNumber(values.length, 'int', 32), WasmType.I32))
      .pushRaw(0x41).pushNumber(sz, 'int', 32).pushRaw(0x6A);
    for (let i = 0; i < values.length; i++) {
      if (i < values.length - 1) final.pushRaw(...duplicate(aux));
      final.pushExpr(this.writeItem(values[i], tp));
      if (i < values.length - 1) final.pushRaw(0x41).pushNumber(sz, 'int', 32).pushRaw(0x6A);
    }
    return final;
  }

  /**
   * This method expects the address to be already in the stack
   */
  copyBuffer(buffer: Uint8Array, aux: number): WasmExpression {
    const final = new WasmExpression();
    for (let i = 0; i < buffer.length; i++) {
      if (i < buffer.length - 1) final.pushRaw(...duplicate(aux));
      final.pushRaw(0x41).pushNumber(buffer[i], 'int', 32).pushRaw(0x36, 0, 0);
      if (i < buffer.length - 1) final.pushRaw(0x41).pushNumber(1, 'int', 32).pushRaw(0x6A);
    }
    return final;
  }

  /**
   * This method expects the base address to be already in the stack
   */
  accessConstant(tp: WasmType | WasmType[], pos: number): WasmExpression {
    if (!Array.isArray(tp)) {
      const sz = WasmTypeBytes[tp];
      if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
      return new WasmExpression(0x41).pushNumber(pos * sz, 'int', 32).pushRaw(0x6A).pushExpr(this.readItem(tp));
    }
    let compSz = 0;
    for (let i = 0; i < pos; i++) {
      const sz = WasmTypeBytes[tp[i]];
      if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
      compSz += sz;
    }
    return new WasmExpression(0x41).pushNumber(compSz, 'int', 32)
      .pushRaw(0x6A)
      .pushExpr(this.readItem(tp[pos]));
  }

  /**
   * This method expects the base address to be already in the stack
   */
  access(tp: WasmType, pos: WasmExpression): WasmExpression {
    const sz = WasmTypeBytes[tp];
    if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
    return new WasmExpression(0x41).pushNumber(sz, 'int', 32)
      .pushExpr(pos).pushRaw(0x6C)
      .pushRaw(0x6A)
      .pushExpr(this.readItem(tp));
  }
}