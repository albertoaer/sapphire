import { sapp } from '../common.ts';
import { References } from './constants.ts';
import { constants as vmc } from '../../wasm_vm/mod.ts';

const route: sapp.Module['route'] = 'kernel:sapp_wasm';

function funcToDef(name: string, funcs: sapp.Func[]): [string, sapp.Def] {
  return [name, {
    route,
    funcs: new Map([['', funcs ]]),
    instanceFuncs: new Map(),
    name
  }]
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

const neg: sapp.Func[] = [
  {
    inputSignature: [sapp.I32],
    outputSignature: sapp.I32,
    source: References.i32_neg
  },
  {
    inputSignature: [sapp.I64],
    outputSignature: sapp.I64,
    source: References.i64_neg
  },
  {
    inputSignature: [sapp.F32],
    outputSignature: sapp.F32,
    source: References.f32_neg
  },
  {
    inputSignature: [sapp.F64],
    outputSignature: sapp.F64,
    source: References.f64_neg
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

const not: sapp.Func[] = [
  {
    inputSignature: [sapp.Bool],
    outputSignature: sapp.Bool,
    source: References.not
  }
]

const i32: sapp.Func[] = [
  {
    inputSignature: [sapp.Bool],
    outputSignature: sapp.I32,
    source: References.nop
  },
  {
    inputSignature: [sapp.I64],
    outputSignature: sapp.I32,
    source: References.i64_to_i32
  },
  {
    inputSignature: [sapp.F32],
    outputSignature: sapp.I32,
    source: References.f32_to_i32
  },
  {
    inputSignature: [sapp.F64],
    outputSignature: sapp.I32,
    source: References.f64_to_i32
  }
]

const i64: sapp.Func[] = [
  {
    inputSignature: [sapp.Bool],
    outputSignature: sapp.I64,
    source: References.i32_to_i64
  },
  {
    inputSignature: [sapp.I32],
    outputSignature: sapp.I64,
    source: References.i32_to_i64
  },
  {
    inputSignature: [sapp.F32],
    outputSignature: sapp.I64,
    source: References.f32_to_i64
  },
  {
    inputSignature: [sapp.F64],
    outputSignature: sapp.I64,
    source: References.f64_to_i64
  }
]

const f32: sapp.Func[] = [
  {
    inputSignature: [sapp.I32],
    outputSignature: sapp.F32,
    source: References.i32_to_f32
  },
  {
    inputSignature: [sapp.I64],
    outputSignature: sapp.F32,
    source: References.i64_to_f32
  },
  {
    inputSignature: [sapp.F64],
    outputSignature: sapp.F32,
    source: References.f64_to_f32
  }
]

const f64: sapp.Func[] = [
  {
    inputSignature: [sapp.I32],
    outputSignature: sapp.F64,
    source: References.i32_to_f64
  },
  {
    inputSignature: [sapp.I64],
    outputSignature: sapp.F64,
    source: References.i64_to_f64
  },
  {
    inputSignature: [sapp.F32],
    outputSignature: sapp.F64,
    source: References.f32_to_f64
  }
]

const bool: sapp.Func[] = [
  {
    inputSignature: [sapp.I32],
    outputSignature: sapp.Bool,
    source: References.i32_nqz
  },
  {
    inputSignature: [sapp.I64],
    outputSignature: sapp.Bool,
    source: References.i64_nqz
  }
]

const pop: sapp.Func = { inputSignature: [sapp.Any], outputSignature: sapp.Void, source: References.drop };

const alloc: sapp.Func = {
  inputSignature: [sapp.I32],
  outputSignature: sapp.I32,
  source: [vmc.KernelImportName, vmc.AllocFnName]
}

const dealloc: sapp.Func = {
  inputSignature: [sapp.I32],
  outputSignature: sapp.Void,
  source: [vmc.KernelImportName, vmc.DeallocFnName]
}

const str_ref: sapp.Func = {
  inputSignature: [sapp.String],
  outputSignature: sapp.ExternRef,
  source: [vmc.KernelImportName, vmc.StrRefFnName]
}

const arr_ref_get: sapp.Func = {
  inputSignature: [sapp.ExternRef, sapp.I32],
  outputSignature: sapp.ExternRef,
  source: [vmc.KernelImportName, vmc.ArrRefGetFnName]
}

const len: sapp.Func[] = [
  {
    inputSignature: [sapp.String],
    outputSignature: sapp.I32,
    source: [vmc.KernelImportName, vmc.LenFnName]
  },
  {
    inputSignature: [sapp.ArrayAny],
    outputSignature: sapp.I32,
    source: [vmc.KernelImportName, vmc.LenFnName]
  }
]

const echo: sapp.Func[] = ((): sapp.Func[] => {
  const echoes: sapp.Func[] = [];
  for (const tp of [
    sapp.ExternRef, sapp.String, sapp.String, sapp.Bool, sapp.I32, sapp.I64, sapp.F32, sapp.F64, sapp.ArrayAny
  ]) echoes.push({
    inputSignature: [tp],
    outputSignature: sapp.Void,
    source: [vmc.KernelImportName, vmc.EchoFnName]
  })
  return echoes;
})();

export const Kernel: sapp.Module = {
  route,
  defs: new Map([
    funcToDef('+', add),
    funcToDef('-', [...sub, ...neg]),
    funcToDef('*', mul),
    funcToDef('/', div),
    funcToDef('%', rem),

    funcToDef('not', not),
    funcToDef('!', not),

    funcToDef('i32', i32),
    funcToDef('i64', i64),
    funcToDef('f32', f32),
    funcToDef('f64', f64),
    funcToDef('bool', bool),
    funcToDef('!!', bool),
    funcToDef('pop', [pop]),
    funcToDef('alloc', [alloc]),
    funcToDef('dealloc', [dealloc]),
    funcToDef('str_ref', [str_ref]),
    funcToDef('arr_ref_get', [arr_ref_get]),
    funcToDef('len', len),
    funcToDef('echo', echo)
  ]),
  exports: [] as sapp.Def[]
} as const;