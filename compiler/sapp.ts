export type ModuleDescriptor = string[]
export type ModuleRoute = `${'kernel' | 'virtual' | 'file' | 'web'}:${string}`

const nativeType = ['string', 'bool', 'i32', 'i64', 'f32', 'f64'] as const;
export type NativeType = typeof nativeType[number];

export function isNativeType(name: string): name is NativeType {
  return nativeType.includes(name as NativeType);
}

export type Literal = {
  type: NativeType,
  value: string
}

export type Expression = ({
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
}) & {
  readonly type: Type;
}

export const ArraySizeAuto = 'auto';

export class Type {
  constructor(
    readonly base: Def | Type[] | NativeType | 'void',
    readonly attrs?: { literal?: string, array?: number | typeof ArraySizeAuto }
  ) {}

  isEquals(tp: Type): boolean {
    if (this.attrs?.array !== tp.attrs?.array || this.attrs?.literal !== tp.attrs?.literal) return false;
    if (typeof this.base === 'string' || typeof tp.base === 'string') return this.base === tp.base;
    if ('route' in this.base) {
      if (!('route' in tp.base)) return false;
      return this.base.route === tp.base.route && tp.base.name === tp.base.name;
    }
    if ('route' in tp.base) return false;
    const base: Type[] = tp.base;
    return this.base.every((x, i) => x.isEquals(base[i]));
  }

  toString(): string {
    const arr = this.attrs?.array !== undefined ? `{${this.attrs.array.toString().replace(ArraySizeAuto, '')}}` : '';
    if (typeof this.base === 'string') return this.base + arr;
    if (Array.isArray(this.base)) return `[${this.base.map(x => x.toString()).join(',')}]` + arr;
    return this.base.name + arr;
  }

  isVoid = () => this.isEquals(Void);
}

export const Void = new Type('void');

export type NativeReference = {
  resolution: 'find',
  id: string
} | {
  resolution: 'apply',
  action: () => void
}

export interface Func {
  readonly inputSignature: Type[], // Parameter types
  readonly fullInputSignature: Type[], // Struct types + Parameter types
  readonly outputSignature: Type, // Return type
  readonly locals: Type[], // Defined locals with their type
  readonly source: Expression | NativeReference // Body
}

export interface Def {
  readonly route: ModuleRoute;
  readonly name: string;
  readonly instanceOverloads: number;

  readonly funcs: { [name in string]: Func[] };
  readonly instanceFuncs: { [name in string]: Func[][] };
}

export type GlobalObject = Module | Def

export interface Module {
  readonly route: ModuleRoute;
  readonly defs: { [name in string]: Def };
}