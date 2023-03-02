import { sapp } from '../common.ts';
import { References } from './constants.ts';

const route: sapp.Module['route'] = 'kernel:sapp_wasm';

function funcToDef(name: string, funcs: sapp.Func[]): sapp.Def {
  return {
    route,
    funcs: new Map([['', funcs ]]),
    instanceFuncs: new Map(),
    instanceOverloads: 0,
    name
  }
}

const add: sapp.Func[] = [
  {
    inputSignature: [sapp.I32, sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_add
  },
  {
    inputSignature: [sapp.I64, sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_add
  },
  {
    inputSignature: [sapp.F32, sapp.F32],
    outputSignature: sapp.F32,
    source: References.f32_add
  },
  {
    inputSignature: [sapp.F64, sapp.F64],
    outputSignature: sapp.F64,
    source: References.f64_add
  }
]

const sub: sapp.Func[] = [
  {
    inputSignature: [sapp.I32, sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_sub
  },
  {
    inputSignature: [sapp.I64, sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_sub
  },
  {
    inputSignature: [sapp.F32, sapp.F32],
    outputSignature: sapp.F32,
    source: References.f32_sub
  },
  {
    inputSignature: [sapp.F64, sapp.F64],
    outputSignature: sapp.F64,
    source: References.f64_sub
  }
]

const mul: sapp.Func[] = [
  {
    inputSignature: [sapp.I32, sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_mul
  },
  {
    inputSignature: [sapp.I64, sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_mul
  },
  {
    inputSignature: [sapp.F32, sapp.F32],
    outputSignature: sapp.F32,
    source: References.f32_mul
  },
  {
    inputSignature: [sapp.F64, sapp.F64],
    outputSignature: sapp.F64,
    source: References.f64_mul
  }
]

const div: sapp.Func[] = [
  {
    inputSignature: [sapp.I32, sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_div
  },
  {
    inputSignature: [sapp.I64, sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_div
  },
  {
    inputSignature: [sapp.F32, sapp.F32],
    outputSignature: sapp.F32,
    source: References.f32_div
  },
  {
    inputSignature: [sapp.F64, sapp.F64],
    outputSignature: sapp.F64,
    source: References.f64_div
  }
]

const rem: sapp.Func[] = [
  {
    inputSignature: [sapp.I32, sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_rem
  },
  {
    inputSignature: [sapp.I64, sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_rem
  }
]

export const Kernel: sapp.Module = {
  route,
  defs: new Map([
    ['+', funcToDef('+', add)],
    ['-', funcToDef('-', sub)],
    ['*', funcToDef('*', mul)],
    ['/', funcToDef('/', div)],
    ['%', funcToDef('%', rem)],
  ]),
  exports: [] as sapp.Def[]
} as const;