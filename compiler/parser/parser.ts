import { TokenList, TokenExpect } from './tokenizer.ts';
import * as tree from './tree.ts';
import { ModuleGenerator, DirtyArgList, DirtyStruct, DirtyFunc, DirtyType, DirtyExpression, DirtyHeuristicList } from './moduleGenerator.ts';

export class ModuleParser {
  constructor(
    private readonly generator: ModuleGenerator,
    private readonly tokens: TokenList,
  ) {}

  tryParseLiteral(): tree.SappLiteral | undefined {
    const tk =
      this.tokens.nextIs({ type: 'string' }) ??
      this.tokens.nextIs({ type: 'float' }) ??
      this.tokens.nextIs({ type: 'int' });
    if (tk) {
      const kernel = this.generator.getMod('kernel');
      if (!kernel) this.tokens.emitError(`No kernel provided`);
      const type = kernel.defs[tk.type];
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

  parseExpression(): DirtyExpression {
    if (this.tokens.nextIs({ value: '.' })) return { id: 'none', nodes: []  };
    const ex = this.tryParseLiteral();
    if (ex) return { id: 'literal', nodes: [ex] };
    this.tokens.emitError('Expecting expression');
  }

  private parseStruct(): DirtyStruct {
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
    const expectedReturn = this.tokens.nextIs({ value: ':' }) ? this.parseType() : undefined;
    const source: DirtyExpression[] = [];
    do {
      source.push(this.parseExpression());
    } while (this.tokens.nextIs({ value: ',' }));
    return { args, name, expectedReturn, struct, source, line }
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
    do {
      let tk;
      if ((tk = this.tokens.nextIs({ type: 'identifier' }))) {
        this.tokens.expectNext({ value: '(' });
        functions.push(this.parseFunc(tk.value));
      }
      else if ((tk = this.tokens.nextIs({ value: '(' }))) functions.push(this.parseFunc(''));
      else if ((tk = this.tokens.nextIs({ value: '[' }))) functions.push(this.parseMethod());
      else if ((tk = this.tokens.nextIs({ value: 'struct' }))) structs.push(this.parseStruct());
    } while (!this.tokens.nextIs({ value: 'end' }));
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
      new ModuleParser(generator, this.io.getModuleTokens(route)).parse();
      const mod = generator.getModule();
      this.moduleInfo[route] = { idx: this.moduleRelations.push([]), mod };
      return mod;
    }
    return this.moduleInfo[route]?.mod as tree.SappModule;
  }
}