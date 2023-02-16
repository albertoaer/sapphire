import {
  Import, Def, Literal, Type, ArgList, Expression, Func, HeuristicList, Struct
} from "./common.ts";
import { ParserError } from '../errors.ts';
import { TokenList, TokenExpect, Token, Tokenizer } from './tokenizer.ts';

export type ParserConfig = { tokens: TokenList } | { source: string }

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
    const tk =
      this.tokens.nextIs({ type: 'string' }) ??
      this.tokens.nextIs({ type: 'float' }) ??
      this.tokens.nextIs({ type: 'int' }) ??
      this.tokens.nextIs({ value: 'true' }) ??
      this.tokens.nextIs({ value: 'false' });
    if (tk) {
      const type = tk.type === 'keyword' ? 'bool' : tk.type;
      return { type: type as Literal['type'], value: tk.value, meta: { line: this.tokens.line } };
    }
  }

  parseName(init: string): string[] {
    const route = [init];
    while (this.tokens.nextIs({ value: '.' }))
      route.push(this.tokens.expectNext({ type: 'identifier' }).value);
    return route;
  }

  parseType(): Type {
    const line = this.tokens.line;
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
        route: this.parseName(this.tokens.expectNext({ type: 'identifier' }).value), meta: { line }
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
    return { array, base, meta: { line } }
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
    return { id: 'build', args, meta: { line: this.tokens.line }};
  }

  parseIf(notEnd?: boolean): Expression {
    const cond = this.parseExpression();
    this.tokens.expectNext({ value: 'then' });
    const then = this.parseExpression();
    this.tokens.expectNext({ value: 'else' });
    const branch = this.tokens.nextIs({ value: 'if' }) ? this.parseIf(true) : this.parseExpression();
    if (!notEnd) this.tokens.expectNext({ value: 'end' });
    return { id: 'if', cond, then, else: branch, meta: { line: this.tokens.line } };
  }

  parseExpressionTerm(): Expression {
    if (this.tokens.nextIs({ value: 'if' })) return this.parseIf();
    if (this.tokens.nextIs({ value: '.' })) return { id: 'none', meta: { line: this.tokens.line } };
    const g = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
    if (g !== undefined) {
      if (g.length === 1) return g[0];
      return { id: 'group', exprs: g, meta: { line: this.tokens.line } };
    }
    const l = this.tryParseLiteral();
    if (l !== undefined) return { id: 'literal', value: l, meta: { line: this.tokens.line } };
    const id = this.tokens.nextIs({ type: 'identifier' });
    if (id) {
      const route = this.parseName(id.value);
      const args = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
      const line = this.tokens.line;
      if (args !== undefined) return { id: 'call', func: { route, meta: { line } }, args: args, meta: { line: this.tokens.line } };
      return { id: 'value', name: { route, meta: { line } }, meta: { line: this.tokens.line } };
    }
    this.tokens.emitError('Expecting expression');
  }

  parseExpressionRecursiveTerm(): Expression {
    let expr = this.parseExpressionTerm();
    let callArgs = undefined;
    let indexArgs = undefined;
    let route = undefined;
    do {
      if ((callArgs = this.tryParseExpressionGroup({ value: '(' }, { value: ')' })) !== undefined)
        expr = { id: 'call', func: expr, args: callArgs, meta: { line: this.tokens.line } };
      if ((indexArgs = this.tryParseExpressionGroup({ value: '[' }, { value: ']' })) !== undefined)
        expr = { id: 'index', origin: expr, args: indexArgs, meta: { line: this.tokens.line } };
      if (this.tokens.nextIs({ value: '.' })) {
        const nm = this.tokens.expectNext({ type: 'identifier' });
        route = this.parseName(nm.value);
        const line = this.tokens.line;
        expr = { id: 'get', origin: expr, name: { route, meta: { line } }, meta: { line: this.tokens.line } };
      } else route = undefined;
    } while (callArgs !== undefined || indexArgs !== undefined || route !== undefined);
    return expr;
  }

  parseExpression(): Expression {
    const op = this.tokens.nextIs({ type: 'operator' });
    let expr: Expression = op
      ? {
        id: 'call',
        func: { route: [op.value], meta: { line: this.tokens.line } },
        args: [this.parseExpressionRecursiveTerm()],
        meta: { line: this.tokens.line }
      }
      : this.parseExpressionRecursiveTerm();

    let opMiddle = this.tokens.nextIs({ type: 'operator' });
    while (opMiddle !== undefined) {
      expr = {
        id: 'call',
        func: { route: [opMiddle.value], meta: { line: this.tokens.line } },
        args: [expr, this.parseExpressionRecursiveTerm()],
        meta: { line: this.tokens.line }
      };
      opMiddle = this.tokens.nextIs({ type: 'operator' });
    }
    return expr;
  }

  parseStruct(): Struct {
    const struct: Struct = { types: [], meta: { line: this.tokens.line } };
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
          meta: { line: this.tokens.line }
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
          meta: { line: this.tokens.line }
        });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext(end);
    }
    return args;
  }

  parseFunc(name: string, struct?: HeuristicList): Func {
    const line = this.tokens.line;
    const inputs = this.parseArgList({ value: ')'});
    const output = this.tokens.nextIs({ value: ':' }) ? this.parseType() : undefined;
    const exprs: Expression[] = [];
    do {
      exprs.push(this.parseExpression());
    } while (this.tokens.nextIs({ value: ',' }));
    const source: Expression = exprs.length === 1 ? exprs[0] : { id: 'group', exprs, meta: { line: this.tokens.line } };
    return { inputs, name, output, struct, source, meta: { line } }
  }

  parseMethod(): Func {
    const args = this.parseHeuristicList({ value: ']' });
    const name = this.tokens.nextIs({ type: 'identifier' })?.value ?? '';
    this.tokens.expectNext({ value: '(' });
    return this.parseFunc(name, args);
  }

  parseUse() {
    const line = this.tokens.line;
    const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
    if (this.tokens.nextIs({ value: 'as' }))
      this.dependencies.push(
        { route: route, meta: { line }, mode: 'named', name: this.tokens.expectNext({ type: 'identifier' }).value }
      );
    else if (this.tokens.nextIs({ value: 'into' }))
      this.dependencies.push({ route: route, meta: { line }, mode: 'into'})
    else
      this.dependencies.push({ route: route, meta: { line }, mode: 'named', name: route.at(-1) as string});
  }

  parseDef() {
    const line = this.tokens.line;
    const name = this.tokens.expectNext({ type: 'identifier' }).value;
    const functions: Func[] = [];
    const structs: Struct[] = [];
    while (!this.tokens.nextIs({ value: 'end' })) {
      while (this.tokens.nextIs({ value: ';' }));
      let tk;
      if ((tk = this.tokens.nextIs({ type: 'identifier' }))) {
        this.tokens.expectNext({ value: '(' });
        functions.push(this.parseFunc(tk.value));
      }
      else if ((tk = this.tokens.nextIs({ value: '(' }))) functions.push(this.parseFunc(''));
      else if ((tk = this.tokens.nextIs({ value: '[' }))) functions.push(this.parseMethod());
      else if ((tk = this.tokens.nextIs({ value: 'struct' }))) structs.push(this.parseStruct());
      else this.tokens.unexpect();
      while (this.tokens.nextIs({ value: ';' }));
    }
    this.definitions.push({ name, structs, functions, meta: { line } });
  }

  parse() {
    while (!this.tokens.empty) {
      if (this.tokens.nextIs({ value: 'use' })) this.parseUse();
      else if (this.tokens.nextIs({ value: 'def' })) this.parseDef();
      else this.tokens.unexpect();
    }
  }
}