export type ParserMeta = { line: number }

export type ParserRoute = {
  readonly route: string[],
  readonly meta: ParserMeta
}

export type Literal = {
  readonly value: string,
  readonly type: 'string' | 'bool' | 'int' | 'float',
  readonly meta: ParserMeta
}

export type Type = {
  readonly base: ParserRoute | Literal | Type[] | 'void',
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
  readonly struct?: HeuristicList
  readonly source: Expression,
  readonly meta: ParserMeta
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
  readonly func: Expression | ParserRoute,
  readonly args: Expression[]
} | {
  readonly id: 'literal',
  readonly value: Literal
} | {
  readonly id: 'value',
  readonly name: ParserRoute
} | {
  readonly id: 'group',
  readonly exprs: Expression[]
} | {
  readonly id: 'index',
  readonly origin: Expression,
  readonly args: Expression[]
} | {
  readonly id: 'get',
  readonly origin: Expression,
  readonly name: ParserRoute
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
  meta: ParserMeta
}