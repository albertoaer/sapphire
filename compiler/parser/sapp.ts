export type ModuleDescriptor = string[] | 'kernel'
export type ModuleRoute = `file:${string}` | 'kernel' | 'virtual'

export type NativeType = 'string' | 'bool' | 'i32' | 'i64' | 'f32' | 'f64'

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
  readonly func: Expression | Func,
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

export class Type {
  constructor(
    readonly base: Def | Type[] | NativeType | 'void',
    readonly array?: number | 'auto'
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
  getSource(): Expression;
}

export interface Def {
  readonly route: ModuleRoute;
  readonly name: string;

  getFunc(name: string, signature: Type[]): Func;
}

export type Global = Module | Def

export interface Module {
  readonly route: ModuleRoute;

  getDef(name: string): Def;
  
  get defs(): Def[];
}