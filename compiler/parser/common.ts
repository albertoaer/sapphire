import { ParserError } from '../errors.ts';

export class ParserMeta {
  constructor(public readonly line: number) { }

  error(msg: string): ParserError {
    return new ParserError(this.line, msg);
  }
}

export type ParserRoute = {
  readonly route: string[],
  readonly meta: ParserMeta
}

export type Literal = {
  readonly value: string,
  readonly type: 'string' | 'bool' | 'i32' | 'i64' | 'f32' | 'f64',
  readonly meta: ParserMeta
}

export type Type = {
  readonly base: ParserRoute | Literal | Type[],
  readonly array?: { size?: number },
  readonly meta: ParserMeta
}

export type ArgList = {
  readonly name: string | null,
  readonly type: Type,
  readonly meta: ParserMeta
}[]

export type HeuristicList = {
  readonly name: string | null,
  readonly type: Type | null,
  readonly meta: ParserMeta
}[]

export type Func = {
  readonly name: string,
  readonly inputs: ArgList,
  readonly output?: Type,
  readonly struct?: HeuristicList,
  readonly source?: Expression,
  readonly meta: ParserMeta,
  readonly force: boolean,
  readonly private: boolean
}

export type Struct = {
  readonly types: Type[],
  readonly meta: ParserMeta
}

export type Expression = ({
  readonly id: 'if',
  readonly cond: Expression,
  readonly then: Expression,
  readonly else: Expression
} | {
  readonly id: 'call',
  readonly name?: ParserRoute,
  readonly instance?: Expression,
  readonly args: Expression[]
} | {
  readonly id: 'literal',
  readonly value: Literal
} | {
  readonly id: 'value',
  readonly name: ParserRoute,
  readonly instance?: Expression
} | {
  readonly id: 'group',
  readonly exprs: Expression[]
} | {
  readonly id: 'tuple_literal',
  readonly exprs: Expression[]
} | {
  readonly id: 'list_literal',
  readonly exprs: Expression[]
} | {
  readonly id: 'assign',
  readonly name: ParserRoute,
  readonly value: Expression
} | {
  readonly id: 'build',
  readonly args: Expression[]
} | {
  readonly id: 'none'
}) & { readonly meta: ParserMeta }

export type Import = {
  route: string[],
  meta: ParserMeta
} & (
  {
    mode: 'named',
    name: string
  } | {
    mode: 'into'
  }
)

export type Def = {
  name: string,
  structs: Struct[],
  functions: Func[],
  meta: ParserMeta,
  extensions: ParserRoute[],
  exported: boolean,
  ensured: boolean,
  private: boolean
}