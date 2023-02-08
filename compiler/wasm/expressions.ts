import { CompilerError } from './common.ts';

export class WasmExpression {
  readonly arr: number[] = [];

  get code() {
    return new Uint8Array(this.arr);
  }

  private ensureBytes(bytes: number[]): number[] {
    if (!bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255))
      throw new CompilerError('Trying to insert non byte array');
    return bytes;
  }

  rawPush(...bytes: number[]) {
    this.arr.push(...this.ensureBytes(bytes));
  }
}