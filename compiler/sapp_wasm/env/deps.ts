import { FunctionInjector, sapp, ResolvedFunction } from '../common.ts';
import { RawInstructions } from './rawCode.ts';

export class EnvironmentInjector implements FunctionInjector {
  getRef(ref: sapp.FunctionReference): ResolvedFunction | undefined {
    const ins = RawInstructions[ref];
    if (ins === undefined) return undefined;
    if (ins.length === 0) return {};
    if (typeof ins[0] === 'number') return {
      postCode: new Uint8Array(ins as number[])
    }
    return { preCode: new Uint8Array(ins[0]), postCode: new Uint8Array(ins[1] as number[]) }
  }
}