import { CompilerError } from '../errors.ts';
import { WasmType } from './module.ts';
import { signedLEB128, unsignedLEB128, ieee754 } from './encoding.ts';

export class WasmExpression {
  private readonly data: number[]

  private ensureBytes(bytes: number[]): number[] {
    if (!bytes.every(x => Number.isInteger(x) && x >= 0 && x <= 255))
      throw new CompilerError('Wasm', 'Trying to insert non byte array');
    return bytes;
  }

  constructor(...data: number[]) {
    this.data = this.ensureBytes(data);
  }

  get code(): Uint8Array {
    return new Uint8Array(this.data);
  }

  pushRaw(...bytes: number[]): WasmExpression {
    this.data.push(...this.ensureBytes(bytes));
    return this;
  }

  pushExpr(...expr: WasmExpression[]): WasmExpression {
    this.data.push(...expr.flatMap(x => Array.from(x.code)));
    return this;
  }

  pushIf(
    cond: WasmExpression, type: WasmType | null, branch: WasmExpression, elseBranch?: WasmExpression
  ): WasmExpression {
    if (elseBranch !== undefined)
      this.data.push(...cond.code, 0x04, type ?? 0x40, ...branch.code, 0x05, ...elseBranch.code, 0x0b);
    else
      this.data.push(...cond.code, 0x04, type ?? 0x40, ...branch.code, 0x0b);
    return this;
  }

  pushNumber(num: number, kind: 'int' | 'uint' | 'float', bits: 32 | 64): WasmExpression {
    switch (kind) {
      case 'int':
        this.data.push(...signedLEB128(num));
        break;
      case 'uint':
        this.data.push(...unsignedLEB128(num));
        break;
      case 'float':
        this.data.push(...ieee754(num, bits));
        break;
    }
    return this;
  }
}