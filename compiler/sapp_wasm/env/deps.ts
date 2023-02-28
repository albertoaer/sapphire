import { FunctionInjector, sapp, ResolvedFunction } from '../common.ts';
import { RawInstructions } from './rawCode.ts';

export class EnvironmentInjector implements FunctionInjector {
  getRef(ref: sapp.FunctionReference): ResolvedFunction | undefined {
    if (ref in RawInstructions) return {
      instruction: new Uint8Array([RawInstructions[ref]]),
      reverseStack: false
    }
  }
}