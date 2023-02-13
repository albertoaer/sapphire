import { CompilerError } from './common.ts';
import { WasmType } from './module.ts';

export class WasmExpression {
  private readonly data: number[]

  private ensureBytes(bytes: number[]): number[] {
    if (!bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255))
      throw new CompilerError('Trying to insert non byte array');
    return bytes;
  }

  constructor(...data: number[]) {
    this.data = this.ensureBytes(data);
  }

  get code(): Uint8Array {
    return new Uint8Array(this.data);
  }

  pushRaw(...bytes: number[]) {
    this.data.push(...this.ensureBytes(bytes));
  }

  pushIf(cond: WasmExpression, type: WasmType | null, branch: WasmExpression, elseBranch?: WasmExpression) {
    if (elseBranch !== undefined)
      this.data.push(...cond.code, 0x04, type ?? 0x40, ...branch.code, 0x05, ...elseBranch.code, 0x0b);
    else
      this.data.push(...cond.code, 0x04, type ?? 0x40, ...branch.code, 0x0b);
  }
}