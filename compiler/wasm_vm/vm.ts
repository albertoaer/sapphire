import * as constants from './constants.ts';
import { MemoryManager } from './memory.ts';
import * as funcs from "./funcs.ts";

const createKernel = (mm: MemoryManager): WebAssembly.ModuleImports => ({
  [constants.AllocFnName]: mm.allocate,
  [constants.MemoryName]: mm.memory,
  [constants.DeallocFnName]: mm.deallocate,
  [constants.StrRefFnName]: funcs.makeStrRef(mm.memory),
  [constants.ArrRefGetFnName]: funcs.indexRefArray,
  [constants.LenFnName]: funcs.makeLen(mm.memory),
  [constants.EchoFnName]: console.log
});

const createImports = (mm: MemoryManager): WebAssembly.Imports => ({
  console: console,
  [constants.KernelImportName]: createKernel(mm)
}) as unknown as WebAssembly.Imports;

export class VM {
  constructor(
    private readonly source: Uint8Array,
    private readonly instance: WebAssembly.Instance,
    private readonly module: WebAssembly.Module
  ) { }

  static async create(source: Uint8Array): Promise<VM> {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const memoryManager = new MemoryManager(memory);
    const imports = createImports(memoryManager);
    const { instance, module } = await WebAssembly.instantiate(source, imports);
    return new VM(source, instance, module);
  }

  get exports(): WebAssembly.Exports {
    return this.instance.exports;
  }
}