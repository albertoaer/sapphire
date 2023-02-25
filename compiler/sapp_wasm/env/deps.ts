import { FunctionInjector, sapp, ResolvedFunction } from '../common.ts';
import { RawInstructions } from './rawCode.ts';

export class EnvironmentInjector implements FunctionInjector {
  get(ref: sapp.FunctionReference): ResolvedFunction | undefined {
    if (typeof ref === 'number' && ref in RawInstructions) return {
      instruction: new Uint8Array([RawInstructions[ref]]),
      reverseStack: false
    }
  }
}