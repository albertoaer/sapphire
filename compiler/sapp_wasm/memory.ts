import { WasmModule, WasmType, WasmExpression } from '../wasm/mod.ts';

const ModName = 'KernelMemory';
const MountedMemory = 'memory';
const FnAllocateName = 'alloc';

/**
 * Provide functions to compile memory features of the language
 */
export class MemoryHelper {
  private readonly alloc: number;

  constructor(module: WasmModule, setMemory: boolean = true) {
    if (setMemory)
      module.configureMemory({ limits: { min: 1 }, import: { mod: ModName, name: MountedMemory } });
    this.alloc = module.import(ModName, FnAllocateName, [WasmType.I32], [WasmType.I32]);
  }

  allocate(tam: number): Uint8Array {
    return new WasmExpression(0x41).pushNumber(tam, 'int', 32).pushRaw(0x10).pushNumber(this.alloc, 'uint', 32).code;
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