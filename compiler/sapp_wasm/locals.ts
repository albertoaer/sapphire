import { wasm } from './common.ts';

export interface Locals {
  /**
   * Locals ready to be collected
   */
  readonly locals: wasm.WasmType[];

  /**
   * @returns Locals relative index
   */
  requireAux(tp: wasm.WasmType): number;
  /**
   * @param idx Locals relative index
   */
  freeAux(idx: number): void;
  /**
   * @param idx Locals relative index
   */
  at(idx: number): wasm.WasmType | undefined;
  /**
   * @param idx Locals relative index
   * @returns Local index with params offset
   */
  wrap(idx: number): number;
  /**
   * @param idx Local index with params offset
   * @returns Locals relative index
   */
  unwrap(idx: number): number;
}

export class DefaultLocals implements Locals {
  private readonly aux: [wasm.WasmType, boolean][] = [];
  private readonly localsBaseSize: number;

  constructor(
    public readonly locals: wasm.WasmType[],
    private readonly paramsOffset: number
  ) {
    this.localsBaseSize = locals.length;
  }

  requireAux(tp: wasm.WasmType): number {
    for (let i = 0; i < this.aux.length; i++) {
      if (this.aux[i][0] == tp && !this.aux[i][1]) {
        this.aux[i][1] = true;
        return i + this.locals.length;
      }
    }
    this.aux.push([tp, true]);
    return this.locals.push(tp) - 1;
  }

  freeAux(idx: number) {
    this.aux[idx - this.localsBaseSize][1] = false;
  }

  at(idx: number): wasm.WasmType | undefined {
    return this.locals[idx];
  }

  wrap(idx: number): number {
    return idx + this.paramsOffset;
  }

  unwrap(idx: number): number {
    return idx - this.paramsOffset;
  }
}