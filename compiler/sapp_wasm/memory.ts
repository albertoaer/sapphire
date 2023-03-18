import { CompilerError } from '../errors.ts';
import { WasmModule, WasmType, WasmExpression, WasmTypeBytes } from '../wasm/mod.ts';
import { duplicate } from './utils.ts';

const ModName = 'KernelMemory';
const MountedMemory = 'memory';
const FnAllocateName = 'alloc';
export const MemoryExportName = `${ModName} ${MountedMemory}`;

/**
 * Provide functions to compile memory features of the language
 */
export class MemoryHelper {
  private readonly alloc: number;

  constructor(module: WasmModule, setMemory: boolean = true) {
    if (setMemory)
      module.configureMemory({ limits: { min: 1 }, import: { mod: ModName, name: MountedMemory }, exportAs: MemoryExportName });
    this.alloc = module.import(ModName, FnAllocateName, [WasmType.I32], [WasmType.I32]);
  }

  allocate(tam: number): WasmExpression {
    return new WasmExpression(0x41).pushNumber(tam, 'int', 32).pushRaw(0x10).pushNumber(this.alloc, 'uint', 32);
  }

  /**
   * This method expect the address to be already in the stack
   */
  copyItem(value: WasmExpression, tp: WasmType): WasmExpression {
    let code: number;
    switch (tp) {
      case WasmType.I32: code = 0x36; break;
      case WasmType.I64: code = 0x37; break;
      case WasmType.F32: code = 0x38; break;
      case WasmType.F64: code = 0x39; break;
      default: throw new CompilerError('Wasm', 'Trying to copy unsupported type into memory');
    }
    return new WasmExpression().pushExpr(value).pushRaw(code, 0, 0);
  }

  /**
   * This method expect the address to be already in the stack
   */
  copy(values: [WasmExpression, WasmType][], aux: number): WasmExpression {
    const final = new WasmExpression();
    for (let i = 0; i < values.length; i++) {
      const [expr, tp] = values[i];
      const sz = WasmTypeBytes[tp];
      if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size');
      if (i < values.length - 1) final.pushRaw(...duplicate(aux));
      final.pushExpr(this.copyItem(expr, tp));
      if (i < values.length - 1) final.pushRaw(0x41).pushNumber(sz, 'int', 32).pushRaw(0x6A);
    }
    return final;
  }

  /**
   * This method expect the address to be already in the stack
   */
  copySame(values: WasmExpression[], tp: WasmType, aux: number): WasmExpression {
    const final = new WasmExpression();
    const sz = WasmTypeBytes[tp];
    if (!sz) throw new CompilerError('Wasm', 'Cannot compute undefined size')
    for (let i = 0; i < values.length; i++) {
      if (i < values.length - 1) final.pushRaw(...duplicate(aux));
      final.pushExpr(this.copyItem(values[i], tp));
      if (i < values.length - 1) final.pushRaw(0x41).pushNumber(sz, 'int', 32).pushRaw(0x6A);
    }
    return final;
  }

  /**
   * This method expect the address to be already in the stack
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
}

/**
 * The actual memory functionalities for the vm
 */
export class MemoryManager {
  constructor(private readonly memory: WebAssembly.Memory) { }

  static createAndPlace(imports: WebAssembly.Imports) {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const mm = new MemoryManager(memory);
    imports[ModName] = {
      [MountedMemory]: memory,
      [FnAllocateName]: mm.allocate
    }
  }

  allocate = (tam: number): number => {
    throw new Error('Not implemented');
  }
}