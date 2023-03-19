type Block = {
  size: number;
  used: boolean;
  offset: number;
}

export class MemoryManager {
  private blocks: Block[];

  constructor(public readonly memory: WebAssembly.Memory) {
    this.blocks = [{ size: memory.buffer.byteLength, used: false, offset: 0 }];
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

      this.blocks.push({ size: old_size - size, used: false, offset: this.blocks[block_index].offset + size });

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