import {
  Import, Def, Literal, Type, ArgList, Expression, Func, HeuristicList, Struct, ParserRoute
} from "./common.ts";
import { ParserError } from '../errors.ts';
import { TokenList, TokenExpect, Token, Tokenizer, Keywords } from './tokenizer.ts';

export type ParserConfig = { tokens: TokenList } | { source: string }

const DefModifiers = ['priv', 'export', 'ensured'] satisfies (typeof Keywords[number])[];
const FuncModifiers = ['priv', 'force'] satisfies (typeof Keywords[number])[];

export class Parser {
  public readonly dependencies: Import[] = [];
  public readonly definitions: Def[] = [];
  private readonly tokens: TokenList;
  private readonly tokenizer: Tokenizer;

  constructor(config: ParserConfig) {
    this.tokenizer = new Tokenizer();
    this.tokens = 'tokens' in config ? config.tokens : this.tokenizer.getTokenList(config.source);
  }

  remain(): Token[] {
    return this.tokens.remain();
  }

  tryParseLiteral(): Literal | undefined {
    const boolV = this.tokens.nextIs({ value: 'true' }) ?? this.tokens.nextIs({ value: 'false' });
    if (boolV) return { type: 'bool', value: boolV.value, meta: this.tokens.createMeta() };
    const stringV = this.tokens.nextIs({ type: 'string' });
    if (stringV) return { type: 'string', value: stringV.value, meta: this.tokens.createMeta() };
    const numberV = this.tokens.nextIs({ type: 'float' }) ?? this.tokens.nextIs({ type: 'int' });
    if (numberV) {
      const type: Literal['type'] = this.tokens.nextIs({ value: '^' }) ?
        (numberV.type === 'int' ? 'i64' : 'f64') :
        (numberV.type === 'int' ? 'i32' : 'f32'); 
      return { type, value: numberV.value, meta: this.tokens.createMeta() };
    }
  }

  parseName(init: string): string[] {
    const route = [init];
    while (this.tokens.nextIs({ value: '.' }))
      route.push(
        this.tokens.nextIs({ type: 'operator' })?.value ??
        this.tokens.expectNext({ type: 'identifier' }).value
      );
    return route;
  }

  parseType(): Type {
    const meta = this.tokens.createMeta();
    let base: Type['base'];
    if (this.tokens.nextIs({ value: '[' })) {
      base = [] as Type[];
      do base.push(this.parseType());
      while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext({ value: ']' });
    } else {
      const literal = this.tryParseLiteral();
      if (literal) base = literal;
      else base = {
        route: this.parseName(this.tokens.expectNext({ type: 'identifier' }).value), meta
      }
    }
    const isArray = !!this.tokens.nextIs({ value: '{' });
    let array: Type['array'] = undefined;
    if (isArray) {
      array = {};
      const size = this.tokens.nextIs({ type: 'int' });
      array['size'] = size ? Number(size.value) : undefined;
      this.tokens.expectNext({ value: '}' });
    }
    return { array, base, meta }
  }

  tryParseExpressionGroup(open: TokenExpect, close: TokenExpect): Expression[] | undefined {
    if (!this.tokens.nextIs(open)) return undefined;
    if (this.tokens.nextIs(close)) return [];
    const group = [];
    do group.push(this.parseExpression());
    while (this.tokens.nextIs({ value: ',' }));
    this.tokens.expectNext(close);
    return group;
  }

  parseBuild(): Expression {
    const args = this.tryParseExpressionGroup({ value: '[' }, { value: ']' });
    if (args === undefined) throw new ParserError(this.tokens.line, 'Expecting arguments to build the struct');
    return { id: 'build', args, meta: this.tokens.createMeta() };
  }

  parseIf(notEnd?: boolean): Expression {
    const cond = this.parseExpression();
    this.tokens.expectNext({ value: 'then' });
    const then = this.parseExpression();
    this.tokens.expectNext({ value: 'else' });
    const branch = this.tokens.nextIs({ value: 'if' }) ? this.parseIf(true) : this.parseExpression();
    if (!notEnd) this.tokens.expectNext({ value: 'end' });
    return { id: 'if', cond, then, else: branch, meta: this.tokens.createMeta() };
  }

  parseAssignment(route: ParserRoute): Expression {
    return { id: 'assign', name: route, meta: this.tokens.createMeta(), value: this.parseExpression() };
  }

  parseListOrTuple(): Expression | undefined {
    const tuple = this.tryParseExpressionGroup({ value: '[' }, { value: ']' });
    if (tuple !== undefined) return { id: 'tuple_literal', exprs: tuple, meta: this.tokens.createMeta() };

    const list = this.tryParseExpressionGroup({ value: '{' }, { value: '}' });
    if (list !== undefined) {
      return { id: 'list_literal', exprs: list, meta: this.tokens.createMeta() };
    }
  }

  parseExpressionTerm(): Expression {
    if (this.tokens.nextIs({ value: 'new' })) return this.parseBuild();
    if (this.tokens.nextIs({ value: 'if' })) return this.parseIf();
    if (this.tokens.nextIs({ value: '.' })) return { id: 'none', meta: this.tokens.createMeta() };

    const listOrTuple = this.parseListOrTuple();
    if (listOrTuple) return listOrTuple;

    const group = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
    if (group !== undefined) {
      if (group.length === 1) return group[0];
      return { id: 'group', exprs: group, meta: this.tokens.createMeta() };
    }
    const l = this.tryParseLiteral();
    if (l !== undefined) return { id: 'literal', value: l, meta: this.tokens.createMeta() };
    const id = this.tokens.nextIs({ type: 'identifier' });
    if (id) {
      const route = this.parseName(id.value);

      if (this.tokens.nextIs({ value: '=' }))
        return this.parseAssignment({ route, meta: this.tokens.createMeta() });

      const args = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
      const meta = this.tokens.createMeta();
      if (args !== undefined) return { id: 'call', name: { route, meta }, args: args, meta };
      return { id: 'value', name: { route, meta }, meta };
    }
    this.tokens.emitError('Expecting expression');
  }

  tryParseExpressionRecursiveOp(expr: Expression): Expression | undefined {
    const callArgs = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
    if (callArgs !== undefined)
      return { id: 'call', instance: expr, args: callArgs, meta: this.tokens.createMeta() };
    const indexArgs = this.tryParseExpressionGroup({ value: '[' }, { value: ']' });
    if (indexArgs !== undefined) {
      const meta = this.tokens.createMeta();
      return { id: 'call', name: { route: ['get'], meta }, args: [expr, ...indexArgs], meta };
    }
    if (this.tokens.nextIs({ value: '.' })) {
      const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
      const meta = this.tokens.createMeta();
      const callArgs = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
      const base = { instance: expr, name: { route, meta }, meta };
      if (callArgs !== undefined) return { id: 'call', args: callArgs, ...base }
      else return { id: 'value', ...base };
    }
    if (this.tokens.nextIs({ value: ':' })) {
      const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
      const meta = this.tokens.createMeta();
      const callArgs = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
      return { id: 'call', name: { route, meta }, meta: expr.meta, args: [expr, ...(callArgs ?? [])] };
    }
  }

  parseExpressionRecursiveTerm(): Expression {
    let expr = this.parseExpressionTerm();
    let next: Expression | undefined = expr;
    do next = this.tryParseExpressionRecursiveOp(expr = next);
    while(next);
    return expr;
  }

  parseExpression(): Expression {
    const op = this.tokens.nextIs({ type: 'operator' });
    let expr: Expression = op
      ? {
        id: 'call',
        name: { route: [op.value], meta: this.tokens.createMeta() },
        args: [this.parseExpressionRecursiveTerm()],
        meta: this.tokens.createMeta()
      }
      : this.parseExpressionRecursiveTerm();

    let opMiddle = this.tokens.nextIs({ type: 'operator' });
    while (opMiddle !== undefined) {
      expr = {
        id: 'call',
        name: { route: [opMiddle.value], meta: this.tokens.createMeta() },
        args: [expr, this.parseExpressionRecursiveTerm()],
        meta: this.tokens.createMeta()
      };
      opMiddle = this.tokens.nextIs({ type: 'operator' });
    }
    return expr;
  }

  parseStruct(): Struct {
    const struct: Struct = { types: [], meta: this.tokens.createMeta() };
    if (!this.tokens.nextIs({ value: '_' }))
      do struct.types.push(this.parseType());
      while (this.tokens.nextIs({ value: ',' }));
    return struct;
  }

  parseArgList(end: TokenExpect): ArgList {
    const args: ArgList = [];
    if (!this.tokens.nextIs(end)) {
      do {
        const type = this.parseType();
        args.push({
          name: this.tokens.nextIs({ type: 'identifier' })?.value ?? null,
          type,
          meta: this.tokens.createMeta()
        });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext(end);
    }
    return args;
  }

  parseHeuristicList(end: TokenExpect): HeuristicList {
    const args: HeuristicList = [];
    if (!this.tokens.nextIs(end)) {
      do {
        const type = this.tokens.nextIs({ value: '_' }) ?? this.parseType();
        args.push({
          name: this.tokens.nextIs({ type: 'identifier' })?.value ?? null,
          type: 'value' in type ? null : type,
          meta: this.tokens.createMeta()
        });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext(end);
    }
    return args;
  }

  parseFunc(name: string, mods: Set<typeof FuncModifiers[number]>, struct?: HeuristicList): Func {
    const modsData = { force: mods.has('force'), private: mods.has('priv') };
    const meta = this.tokens.createMeta();
    const inputs = this.parseArgList({ value: ')'});
    const output = this.tokens.nextIs({ value: ':' }) ? this.parseType() : undefined;

    if (this.tokens.nextIs({ value: ';' })) return { inputs, name, output, struct, meta, ...modsData }

    const exprs: Expression[] = [];
    do {
      exprs.push(this.parseExpression());
    } while (this.tokens.nextIs({ value: ',' }));
    const source: Expression = exprs.length === 1 ? exprs[0] : {
      id: 'group', exprs, meta: this.tokens.createMeta()
    };
    return { inputs, name, output, struct, source, meta, ...modsData }
  }

  parseMethod(mods: Set<typeof FuncModifiers[number]>): Func {
    const args = this.parseHeuristicList({ value: ']' });
    const name = this.tokens.nextIs({ type: 'identifier' })?.value ?? '';
    this.tokens.expectNext({ value: '(' });
    return this.parseFunc(name, mods, args);
  }

  parseExtend(): ParserRoute {
    const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
    return { route: route, meta: this.tokens.createMeta() };
  }

  parseUse() {
    const meta = this.tokens.createMeta();
    const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
    if (this.tokens.nextIs({ value: 'as' }))
      this.dependencies.push(
        { route: route, meta, mode: 'named', name: this.tokens.expectNext({ type: 'identifier' }).value }
      );
    else if (this.tokens.nextIs({ value: 'into' }))
      this.dependencies.push({ route: route, meta, mode: 'into' });
    else
      this.dependencies.push({ route: route, meta, mode: 'named', name: route.at(-1) as string });
  }

  parseDef(mods: Set<typeof DefModifiers[number]>) {
    const meta = this.tokens.createMeta();
    const opname = this.tokens.nextIs({ type: 'operator' })?.value;
    const name = opname ? opname : this.tokens.expectNext({ type: 'identifier' }).value;
    const functions: Func[] = [];
    const structs: Struct[] = [];
    const extensions: ParserRoute[] = [];
    while (!this.tokens.nextIs({ value: 'end' })) {
      while (this.tokens.nextIs({ value: ';' }));
      if (this.tokens.nextIs({ value: 'struct' })) structs.push(this.parseStruct());
      else if (this.tokens.nextIs({ value: 'extends' })) extensions.push(this.parseExtend());
      else {
        const mods = this.getModifiers(FuncModifiers);
        const id = this.tokens.nextIs({ type: 'identifier' });
        if (id) {
          this.tokens.expectNext({ value: '(' });
          functions.push(this.parseFunc(id.value, mods));
        }
        else if (this.tokens.nextIs({ value: '(' })) functions.push(this.parseFunc('', mods));
        else if (this.tokens.nextIs({ value: '[' })) functions.push(this.parseMethod(mods));
        else if (mods.size > 0) throw new ParserError(this.tokens.line, 'Expecting function');
        else if (!this.tokens.nextIs({ value: ';' })) this.tokens.unexpect();
      }
      while (this.tokens.nextIs({ value: ';' }));
    }
    this.definitions.push({
      name, structs, functions, meta, extensions,
      exported: mods.has('export'), ensured: mods.has('ensured'), private: mods.has('priv')
    });
  }

  getModifiers<T extends typeof Keywords[number]>(values: T[]): Set<T> {
    const remain: Set<T> = new Set(values);
    const mods: Set<T> = new Set();
    outter: do {
      for (const v of remain) {
        if (this.tokens.nextIs({ value: v })) {
          remain.delete(v);
          mods.add(v);
          continue outter;
        }
      }
      break;
    } while (true);
    return mods;
  }

  parse() {
    while (!this.tokens.empty) {
      if (this.tokens.nextIs({ value: 'use' })) this.parseUse();
      else {
        const mods = this.getModifiers(DefModifiers);
        if (this.tokens.nextIs({ value: 'def' })) {
          this.parseDef(mods);
        }
        else if (mods.size > 0) throw new ParserError(this.tokens.line, 'Expecting definition');
        else this.tokens.unexpect();
      }
    }
  }
}