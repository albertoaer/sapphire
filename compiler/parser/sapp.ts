export type ModuleDescriptor = string[] | 'kernel'
export type ModuleRoute = `file:${string}` | 'kernel' | 'virtual'

const nativeType = ['string', 'bool', 'i32', 'i64', 'f32', 'f64'] as const;
export type NativeType = typeof nativeType[number];

export function isNativeType(name: string): name is NativeType {
  return nativeType.includes(name as NativeType);
}

export type Literal = {
  type: NativeType,
  value: string
}

export type Expression = {
  readonly id: 'if',
  readonly cond: Expression,
  readonly then: Expression,
  readonly else: Expression
} | {
  readonly id: 'call',
  readonly func: Func,
  readonly args: Expression[]
} | {
  readonly id: 'call_indirect',
  readonly func: Expression,
  readonly args: Expression[]
} | {
  readonly id: 'call_instanced',
  readonly func: Func[],
  readonly owner: Expression,
  readonly args: Expression[]
} | {
  readonly id: 'literal',
  readonly value: Literal
} | {
  readonly id: 'group',
  readonly exprs: Expression[]
} | {
  readonly id: 'index',
  readonly origin: Expression,
  readonly args: Expression[]
} | {
  readonly id: 'local_get' | 'param_get',
  readonly name: number
} | {
  readonly id: 'local_set',
  readonly name: number,
  readonly value: Expression
} | {
  readonly id: 'build',
  readonly args: Expression[]
} | {
  readonly id: 'none'
}

export const ArraySizeAuto = 'auto';

export class Type {
  constructor(
    readonly base: Def | Type[] | NativeType | 'void',
    readonly array?: number | typeof ArraySizeAuto
  ) {}

  isEquals(tp: Type): boolean {
    if (typeof this.base === 'string' || typeof tp.base === 'string') return this.base === tp.base;
    if ('route' in this.base) {
      if (!('route' in tp.base)) return false;
      return this.base.route === tp.base.route && tp.base.name === tp.base.name;
    }
    if ('route' in tp.base) return false;
    const base: Type[] = tp.base;
    return this.base.every((x, i) => x.isEquals(base[i]));
  }
}

export interface Func {
  readonly inputSignature: Type[], // Parameter types
  readonly fullInputSignature: Type[], // Struct types + Parameter types
  readonly outputSignature: Type, // Return type
  readonly locals: Type[], // Defined locals with their type
  readonly source: Expression // Body
}

export interface Def {
  readonly route: ModuleRoute;
  readonly name: string;
  readonly instanceOverloads: number;
  readonly funcs: Func[];
  readonly instanceFuncs: Func[][];

  getFunc(name: string, inputSignature: Type[]): Func | undefined;
  getInstanceFunc(name: string, inputSignature: Type[]): Func[] | undefined;
}

export type Object = Module | Def | Func | Func[]

export interface Module {
  readonly route: ModuleRoute;
  readonly defs: { [name in string]: Def };
}