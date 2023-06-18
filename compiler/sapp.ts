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
  readonly else?: Expression
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
  readonly id: 'tail_call',
  readonly args: Expression[]
} | {
  readonly id: 'literal',
  readonly value: Literal
} | {
  readonly id: 'group' | 'tuple_literal' | 'list_literal',
  readonly exprs: Expression[]
} | {
  readonly id: 'local_get' | 'param_get',
  readonly name: number
} | {
  readonly id: 'access_index',
  readonly structure: Expression,
  readonly idx: number | Expression
} | {
  readonly id: 'local_set',
  readonly name: number,
  readonly value: Expression
} | {
  readonly id: 'build',
  readonly structIdx: number,
  readonly args: Expression[]
} | {
  readonly id: 'object_data',
  readonly obj: Expression
} | {
  readonly id: 'none'
}) & {
  readonly type: Type;
}

export const ArraySizeAuto = 'auto'

export class Type {
  readonly base: Def | Type | Type[] | NativeType | 'void' | `literal:${string}` | 'any' | 'externref';
  readonly array?: number | typeof ArraySizeAuto;

  constructor(base: Type['base'], array?: Type['array']) {
    if (array) {
      this.base = base instanceof Type && !base.array ? base.base : base;
      this.array = array;
    } else if (base instanceof Type) {
      this.base = base.base;
      this.array = base.array;
    } else this.base = base;
  }

  isEquals(tp: Type): boolean {
    if (this.base === 'any' || tp.base === 'any') return true;
    if (this.array !== tp.array) return false;
    if (typeof this.base === 'string' || typeof tp.base === 'string') return this.base === tp.base;
    if ('route' in this.base) {
      if (!('route' in tp.base)) return false;
      return this.base.route === tp.base.route && this.base.name === tp.base.name;
    }
    if ('route' in tp.base) return false;
    if (Array.isArray(this.base)) {
      if (!(Array.isArray(tp.base))) return false;
      return typeArrayEquals(this.base, tp.base);
    }
    if (Array.isArray(tp.base)) return false;
    return this.base.isEquals(tp.base);
  }

  toString(): string {
    const arr = this.array !== undefined ? `{${this.array.toString().replace(ArraySizeAuto, '')}}` : '';
    if (typeof this.base === 'string') return this.base + arr;
    if (Array.isArray(this.base)) return `[${this.base.map(x => x.toString()).join(',')}]` + arr;
    if (this.base instanceof Type) return this.base.toString() + arr;
    return this.base.name + arr;
  }

  get isVoid(): boolean { return this.isEquals(Void); }
}

export const Void = new Type('void');
export const Any = new Type('any');
export const ExternRef = new Type('externref');
export const String = new Type('string');
export const Bool = new Type('bool');
export const I32 = new Type('i32');
export const I64 = new Type('i64');
export const F32 = new Type('f32');
export const F64 = new Type('f64');
export const ArrayAny = new Type(Any, 'auto');

export const typeArrayEquals = (a: Type[], b: Type[]): boolean =>
  a.length === b.length && a.every((t, i) => t.isEquals(b[i]));

// References and routes are treated by the compiler
export type FunctionReference = number
export type FunctionRoute = string[]

export type FunctionBody = [Expression | undefined] | FunctionReference | FunctionRoute;

export interface Func<T extends FunctionBody = FunctionBody> {
  readonly inputSignature: Type[]; // Parameter types
  readonly struct?: Type[]; // Struct types
  readonly outputSignature: Type; // Return type
  readonly locals?: Type[]; // Defined locals with their type
  readonly source: T; // Body
  readonly dependsOn?: Set<Func | Func[]>; // Functions called inside the function
  readonly isRecursive?: boolean;
}

export function isRefFunc(func: Func): func is Func<FunctionReference> {
  return typeof func.source === 'number';
}

export function isRouteFunc(func: Func): func is Func<FunctionRoute> {
  return Array.isArray(func.source) && func.source.length > 1 && typeof func.source[0] === 'string';
}

export interface Def {
  readonly route: ModuleRoute;
  readonly name: string;

  readonly funcs: Map<string, Func[]>;
  readonly instanceFuncs: Map<string, Func[][]>;
}

export interface Module {
  readonly route: ModuleRoute;
  readonly defs: Map<string, Def>;
  readonly exports: Def[];
}