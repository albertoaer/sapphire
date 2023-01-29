import { ParserError } from "./common.ts";
import * as tree from './tree.ts';

export type DirtyType = Omit<tree.SappType, 'base'> & { base: string[] | DirtyType[] }

export type DirtyArgList = {
  name: string | null,
  type: DirtyType
}[]

type ArgList = {
  name: string | null,
  type: tree.SappType
}[]

export type DirtyExpression = Omit<tree.SappExpression, 'nodes'> & {
  nodes: (Exclude<tree.SappExpression['nodes'][number], number | tree.SappFunc> | string[])[]
}

export type DirtyStruct = Omit<tree.SappStruct, 'types'> & { types: DirtyType[] }

export type DirtyFunc = Omit<tree.SappFunc, 'args' | 'source' | 'return' | 'struct'> & {
  source: DirtyExpression[],
  args: DirtyArgList,
  struct?: DirtyArgList,
  expectedReturn: DirtyType | undefined
}

type PrecalculatedFunc = Omit<tree.SappFunc, 'return'> & {
  return: tree.SappType | 'not calculated'
}

type FunctionContext = {
  expectedReturn: tree.SappType | null,
  args: ArgList,
  struct: ArgList | undefined,
  vars: {
    father: FunctionContext['vars'] | null,
    origin: number,
    types: { [alias:string]: tree.SappType }
  } | undefined
}

export class ModuleGenerator {
  private readonly ctx: Map<string, tree.SappModule | tree.SappDef> = new Map();
  private readonly defs: Map<string, [tree.SappDef, DirtyStruct[], DirtyFunc[]]> = new Map();
  private readonly funcs: [PrecalculatedFunc, DirtyExpression[], FunctionContext][] = [];

  constructor(
    private readonly route: tree.SappModuleRoute,
    private readonly req?: (descriptor: tree.SappModuleDescriptor) => tree.SappModule | undefined
  ) {
    if (req) {
      const kernel = req('kernel');
      if (kernel) this.ctx.set('kernel', kernel);
    }
  }

  useMod(route: string[], into: boolean, line: number) {
    if (route.length === 0) throw new ParserError(line, 'Invalid route');
    if (this.req) {
      const mod = this.req(route);
      if (mod) {
        if (into) for (const [name, def] of Object.entries(mod.defs))
          this.ctx.set(name, def);
        else this.ctx.set(route.at(-1) as string, mod);
      } else throw new ParserError(line, 'Module not found');
    } else throw new ParserError(line, 'Rquesting modules is disabled');
  }

  getMod(name: string): tree.SappModule | undefined {
    const mod = this.ctx.get(name);
    if (mod && 'route' in mod) return mod;
  }

  addDef(name: string, structs: DirtyStruct[], funcs: DirtyFunc[]) {
    this.defs.set(name, [{
      name,
      origin: this.route,
      functions: [],
      structs: []
    }, structs, funcs]);
  }

  private globalName(name: string): tree.SappDef | tree.SappModule | undefined {
    return this.defs.get(name)?.[0] ??
      (this.ctx.get('kernel') as tree.SappModule | undefined)?.defs[name] ??
      this.ctx.get(name);
  }

  private resolveType({ array, base, line }: DirtyType): tree.SappType {
    if (base.length === 0) throw new ParserError(line, 'Invalid type signature');
    if (typeof base[0] === 'string') {
      let tp = this.globalName(base[0]);
      if (tp === undefined) throw new ParserError(line, `Unknown name ${base[0]}`);
      if ('route' in tp) {
        if (base[1] === undefined) throw new ParserError(line, 'Module can not be a type');
        tp = tp.defs[base[1] as string];
        if (tp === undefined) throw new ParserError(line, `Type not found ${base[1]}`);
        if (base[2] !== undefined) throw new ParserError(line, `Unexpected child ${base[2]}`);
      } else if (base[1] !== undefined) throw new ParserError(line, `Unexpected child ${base[1]}`);
      return { array, line, base: tp }
    } else return { array, line, base: (base as DirtyType[]).map(this.resolveType.bind(this)) }
  }

  private getFuncStruct(structs: tree.SappStruct[], fields: tree.SappType[]): tree.SappStruct {
    const filtered = structs.filter(x => x.types.length === fields.length);
    for (const struct of filtered) {
      let i = 0;
      for (; i < struct.types.length; i++)
        if (!tree.compareTypes(struct.types[i], fields[i])) break;
      if (i == struct.types.length) return struct;
    }
    throw new ParserError(fields[0].line, 'Incompatible struct')
  }

  private getFunctionContext(fn: DirtyFunc): FunctionContext {
    return {
      expectedReturn: fn.expectedReturn ? this.resolveType(fn.expectedReturn) : null,
      args: fn.args.map(x => { return { name: x.name, type: this.resolveType(x.type) } }),
      struct: fn.struct ? fn.struct.map(x => { return { name: x.name, type: this.resolveType(x.type) } }) : undefined,
      vars: undefined
    }
  }

  private buildDefinitions() {
    for (const [def, structs, funcs] of this.defs.values()) {
      def.structs.push(...structs.map(x => { return { types: x.types.map(this.resolveType.bind(this)) }}))
      for (const func of funcs) {
        const ctx = this.getFunctionContext(func);
        if (ctx.struct !== undefined && ctx.struct.length == 0) throw new ParserError(func.line, 'Empty struct is not allowed');
        const fn: PrecalculatedFunc = {
          name: func.name,
          args: ctx.args.map(x => x.type),
          source: [],
          struct: ctx.struct ? this.getFuncStruct(def.structs, ctx.struct.map(x => x.type)) : undefined,
          return: 'not calculated',
          line: func.line
        }
        def.functions.push(fn as tree.SappFunc); // It's tricky but will save time
        this.funcs.push([fn, func.source, ctx]);
      }
    }
  }

  private validateFunctions() {
    for (const func of this.funcs) {
      console.log(...func)
    }
  }

  getModule(): tree.SappModule {
    this.buildDefinitions();
    this.validateFunctions();
    return {
      defs: Object.fromEntries(Object.entries(this.defs).map(x => [x[0], x[1][0]])),
      route: this.route
    }
  }
}