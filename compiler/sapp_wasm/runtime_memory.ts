export const ModName = 'KernelMemory';
export const MountedMemory = 'memory';
export const FnAllocateName = 'alloc';
export const FnDeallocateName = 'dealloc';
export const MemoryExportName = `${ModName} ${MountedMemory}`;

type Block = {
  size: number;
  used: boolean;
  offset: number;
}

export class MemoryManager {
  private blocks: Block[];

  constructor(private readonly memory: WebAssembly.Memory) {
    this.blocks = [{ size: memory.buffer.byteLength, used: false, offset: 0 }];
  }

  static createAndPlace(imports: WebAssembly.Imports) {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const mm = new MemoryManager(memory);
    imports[ModName] = {
      [MountedMemory]: memory,
      [FnAllocateName]: mm.allocate,
      [FnDeallocateName]: mm.deallocate,
    }
  }

  allocate = (size: number): number => {
    let block_index = this.blocks.length;
    let smallest_block_size = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < this.blocks.length; i++)
      if (
        !this.blocks[i].used &&
        this.blocks[i].size >= size &&
        this.blocks[i].size < smallest_block_size
      ) {
        block_index = i;
        smallest_block_size = this.blocks[i].size;
      }

    if (block_index === this.blocks.length)
      throw new Error('Memory buffer overflow');

    if (this.blocks[block_index].size - size > 0) {
      const old_size = this.blocks[block_index].size;
      this.blocks[block_index].size = size;
      this.blocks[block_index].used = true;

      this.blocks.push({ size: old_size - size, used: false, offset: size });

      return this.blocks[block_index].offset;
    } else {
      this.blocks[block_index].used = true;
      return this.blocks[block_index].offset;
    }
  }

  deallocate = (ptr: number): void => {
    throw new Error('not implemented yet');
  }
}