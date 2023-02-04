import { TokenList, TokenExpect, Token } from './tokenizer.ts';
import * as tree from './tree.ts';
import {
  ModuleGenerator, DirtyArgList, DirtyStruct, DirtyFunc, DirtyType, DirtyExpression, DirtyHeuristicList
} from './moduleGenerator.ts';
import { ParserError } from './common.ts';

export class ModuleParser {
  constructor(
    private readonly tokens: TokenList,
    private readonly generator: ModuleGenerator,
  ) {}

  remain(): Token[] {
    return this.tokens.remain();
  }

  tryParseLiteral(): tree.SappLiteral | undefined {
    const tk =
      this.tokens.nextIs({ type: 'string' }) ??
      this.tokens.nextIs({ type: 'float' }) ??
      this.tokens.nextIs({ type: 'int' }) ??
      this.tokens.nextIs({ value: 'true' }) ??
      this.tokens.nextIs({ value: 'false' });
    if (tk) {
      const kernel = this.generator.getMod('kernel');
      if (!kernel) this.tokens.emitError(`No kernel provided`);
      const type = kernel.defs[tk.type === 'keyword' ? 'bool' : tk.type];
      if (!type) this.tokens.emitError(`Kernel does not provide ${tk.type}`);
      return { type, value: tk.value };
    }
  }

  parseName(init: string): string[] {
    const route = [init];
    while (this.tokens.nextIs({ value: '.' })) {
      route.push(this.tokens.expectNext({ type: 'identifier' }).value);
    }
    return route;
  }

  parseType(): DirtyType {
    const line = this.tokens.line;
    let base: DirtyType['base'];
    if (this.tokens.nextIs({ value: '[' })) {
      base = [] as DirtyType[];
      do base.push(this.parseType());
      while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext({ value: ']' });
    } else {
      const literal = this.tryParseLiteral();
      if (literal) base = literal;
      else {
        base = [] as string[];
        base.push(...this.parseName(this.tokens.expectNext({ type: 'identifier' }).value));
      }
    }
    const isArray = !!this.tokens.nextIs({ value: '{' });
    let array: DirtyType['array'] = undefined;
    if (isArray) {
      array = {};
      const size = this.tokens.nextIs({ type: 'int' });
      array['size'] = size ? Number(size.value) : undefined;
      this.tokens.expectNext({ value: '}' });
    }
    return { array, base, line }
  }

  tryParseExpressionGroup(open: TokenExpect, close: TokenExpect): DirtyExpression[] | undefined {
    if (!this.tokens.nextIs(open)) return undefined;
    if (this.tokens.nextIs(close)) return [];
    const group = [];
    do group.push(this.parseExpression());
    while (this.tokens.nextIs({ value: ',' }));
    this.tokens.expectNext(close);
    return group;
  }

  parseBuild(): DirtyExpression {
    const args = this.tryParseExpressionGroup({ value: '[' }, { value: ']' });
    if (args === undefined) throw new ParserError(this.tokens.line, 'Expecting arguments to build the struct');
    return { id: 'build', args, line: this.tokens.line};
  }

  parseIf(notEnd?: boolean): DirtyExpression {
    const cond = this.parseExpression();
    this.tokens.expectNext({ value: 'then' });
    const then = this.parseExpression();
    this.tokens.expectNext({ value: 'else' });
    const branch = this.tokens.nextIs({ value: 'if' }) ? this.parseIf(true) : this.parseExpression();
    if (!notEnd) this.tokens.expectNext({ value: 'end' });
    return { id: 'if', cond, then, else: branch, line: this.tokens.line };
  }

  parseExpressionTerm(): DirtyExpression {
    if (this.tokens.nextIs({ value: 'if' })) return this.parseIf();
    if (this.tokens.nextIs({ value: '.' })) return { id: 'none', line: this.tokens.line };
    const g = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
    if (g !== undefined) {
      if (g.length === 1) return g[0];
      return { id: 'group', exprs: g, line: this.tokens.line };
    }
    const l = this.tryParseLiteral();
    if (l !== undefined) return { id: 'literal', value: l, line: this.tokens.line };
    const id = this.tokens.nextIs({ type: 'identifier' });
    if (id) {
      const name = this.parseName(id.value);
      const args = this.tryParseExpressionGroup({ value: '(' }, { value: ')' });
      if (args !== undefined) return { id: 'call', func: name, args: args, line: this.tokens.line };
      return { id: 'value', of: name, line: this.tokens.line };
    }
    this.tokens.emitError('Expecting expression');
  }

  parseExpressionRecursiveTerm(): DirtyExpression {
    let expr = this.parseExpressionTerm();
    let callArgs = undefined;
    let indexArgs = undefined;
    let accessName = undefined;
    do {
      if ((callArgs = this.tryParseExpressionGroup({ value: '(' }, { value: ')' })) !== undefined)
        expr = { id: 'call', func: expr, args: callArgs, line: this.tokens.line };
      if ((indexArgs = this.tryParseExpressionGroup({ value: '[' }, { value: ']' })) !== undefined)
        expr = { id: 'index', origin: expr, args: indexArgs, line: this.tokens.line };
      if (this.tokens.nextIs({ value: '.' })) {
        const nm = this.tokens.expectNext({ type: 'identifier' });
        accessName = this.parseName(nm.value);
        expr = { id: 'get', origin: expr, name: accessName, line: this.tokens.line };
      } else accessName = undefined;
    } while (callArgs !== undefined || indexArgs !== undefined || accessName !== undefined);
    return expr;
  }

  parseExpression(): DirtyExpression {
    const op = this.tokens.nextIs({ type: 'operator' });
    let expr: DirtyExpression = op
      ? { id: 'call', func: [op.value], args: [this.parseExpressionRecursiveTerm()], line: this.tokens.line }
      : this.parseExpressionRecursiveTerm();

    let opMiddle = this.tokens.nextIs({ type: 'operator' });
    while (opMiddle !== undefined) {
      expr = {
        id: 'call', func: [opMiddle.value], args: [expr, this.parseExpressionRecursiveTerm()], line: this.tokens.line
      };
      opMiddle = this.tokens.nextIs({ type: 'operator' });
    }
    return expr;
  }

  parseStruct(): DirtyStruct {
    const struct: DirtyStruct = { types: [], line: this.tokens.line };
    if (!this.tokens.nextIs({ value: '_' }))
      do struct.types.push(this.parseType());
      while (this.tokens.nextIs({ value: ',' }));
    return struct;
  }

  parseArgList(end: TokenExpect): DirtyArgList {
    const args: DirtyArgList = [];
    if (!this.tokens.nextIs(end)) {
      do {
        const type = this.parseType();
        args.push({ name: this.tokens.nextIs({ type: 'identifier' })?.value ?? null, type });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext(end);
    }
    return args;
  }

  parseHeuristicList(end: TokenExpect): DirtyHeuristicList {
    const args: DirtyHeuristicList = [];
    if (!this.tokens.nextIs(end)) {
      do {
        const type = this.tokens.nextIs({ value: '_' }) ?? this.parseType();
        args.push({
          name: this.tokens.nextIs({ type: 'identifier' })?.value ?? null,
          type: 'value' in type ? null : type
        });
      } while (this.tokens.nextIs({ value: ',' }));
      this.tokens.expectNext(end);
    }
    return args;
  }

  parseFunc(name: string, struct?: DirtyHeuristicList): DirtyFunc {
    const line = this.tokens.line;
    const args = this.parseArgList({ value: ')'});
    const ret = this.tokens.nextIs({ value: ':' }) ? this.parseType() : undefined;
    const exprs: DirtyExpression[] = [];
    do {
      exprs.push(this.parseExpression());
    } while (this.tokens.nextIs({ value: ',' }));
    const source: DirtyExpression = exprs.length === 1 ? exprs[0] : { id: 'group', exprs, line: this.tokens.line };
    return { args, name, return: ret, struct, source, line }
  }

  parseMethod(): DirtyFunc {
    const args = this.parseHeuristicList({ value: ']' });
    const name = this.tokens.nextIs({ type: 'identifier' })?.value ?? '';
    this.tokens.expectNext({ value: '(' });
    return this.parseFunc(name, args);
  }

  parseUse() {
    const line = this.tokens.line;
    const route = this.parseName(this.tokens.expectNext({ type: 'identifier' }).value);
    if (this.tokens.nextIs({ value: 'as' }))
      this.generator.useMod(route, false, line, this.tokens.expectNext({ type: 'identifier' }).value);
    else this.generator.useMod(route, !!this.tokens.nextIs({ value: 'into'}), line);
  }

  parseDef() {
    const name = this.tokens.expectNext({ type: 'identifier' }).value;
    const functions: DirtyFunc[] = [];
    const structs: DirtyStruct[] = [];
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
    this.generator.addDef(name, structs, functions);
  }

  parse() {
    while (!this.tokens.empty) {
      if (this.tokens.nextIs({ value: 'use' })) this.parseUse();
      else if (this.tokens.nextIs({ value: 'def' })) this.parseDef();
      else this.tokens.unexpect();
    }
  }
}

export interface IOParserSupport {
  solveModuleRoute(descriptor: tree.SappModuleDescriptor): tree.SappModuleRoute;
  getModuleTokens(route: tree.SappModuleRoute): TokenList;
}

export class Parser {
  moduleRelations: number[][] = [];
  moduleInfo: { [name in tree.SappModuleRoute]?: { idx: number, mod: tree.SappModule } } = {};

  constructor(private io: IOParserSupport) {}

  parseModule = (descriptor: tree.SappModuleDescriptor): tree.SappModule => {
    const route = this.io.solveModuleRoute(descriptor);
    if (!(route in this.moduleInfo)) {
      const generator = new ModuleGenerator(route, this.parseModule);
      new ModuleParser(this.io.getModuleTokens(route), generator).parse();
      const mod = generator.generateModule();
      this.moduleInfo[route] = { idx: this.moduleRelations.push([]), mod };
      return mod;
    }
    return this.moduleInfo[route]?.mod as tree.SappModule;
  }
}