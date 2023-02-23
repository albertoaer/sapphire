import type { FunctionInjector, RawCodeSpec } from '../common.ts';
import { RawInstructions } from './rawCode.ts';

export class EnvironmentInjector implements FunctionInjector {
  get(ref: number): number | RawCodeSpec | undefined {
    if (ref in RawInstructions) return {
      instruction: new Uint8Array([RawInstructions[ref]]),
      reverseStack: false
    }
  }
}