import { ParserError } from "./common.ts";
import * as tree from './tree.ts';

export type DirtyType = Omit<tree.SappType, 'base'> & {
  base: string[] | tree.SappLiteral | DirtyType[]
}

export type DirtyArgList = {
  name: string | null,
  type: DirtyType
}[]

export type DirtyHeuristicList = {
  name: string | null,
  type: DirtyType | null
}[]

type ArgList = {
  name: string | null,
  type: tree.SappType
}[]

export type DirtyExpression = Omit<tree.SappExpression, 'nodes'> & {
  nodes: (Exclude<tree.SappExpression['nodes'][number], number | tree.SappFunc> | string[])[]
}

export type DirtyStruct = Omit<tree.SappStruct, 'types'> & { types: DirtyType[], line: number }

export type DirtyFunc = Omit<tree.SappFunc, 'args' | 'source' | 'return' | 'struct'> & {
  source: DirtyExpression[],
  args: DirtyArgList,
  struct?: DirtyHeuristicList,
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

  useMod(route: string[], into: boolean, line: number, importName?: string) {
    if (route.length === 0) throw new ParserError(line, 'Invalid route');
    if (this.req) {
      const mod = this.req(route);
      if (mod) {
        if (into) for (const [name, def] of Object.entries(mod.defs))
          this.ctx.set(name, def);
        else this.ctx.set(importName ?? route.at(-1) as string, mod);
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
    if ('type' in base) return { array, line, base };
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

  private pushNewStruct(structs: tree.SappStruct[], dirties: DirtyStruct[]) {
    for (const dirty of dirties) {
      const struct = { types: dirty.types.map(this.resolveType.bind(this)) };
      if (structs.find(x => x.types.length === struct.types.length && x.types.every((v, i) => 
        tree.compareTypes(struct.types[i], v)
      ))) throw new ParserError(dirty.line, 'Repeated struct');
      structs.push(struct);
    }
  }

  private inferStructTypes(structs: tree.SappStruct[], fields: DirtyHeuristicList, line: number): [tree.SappStruct, ArgList] {
    const splitted = fields.map(x => [x.name, x.type ? this.resolveType(x.type) : null] as [string | null, tree.SappType | null]);
    const filtered = structs.filter(x => x.types.length === fields.length &&
      x.types.every((v, i) => splitted[i][1] === null || tree.compareTypes(v, splitted[i][1] as tree.SappType)));
    if (filtered.length === 0) throw new ParserError(line, 'Struct mismatch');
    if (filtered.length > 1) throw new ParserError(line, 'Struct ambiguity');
    return [filtered[0], splitted.map((v, i) => { return { name: v[0], type: filtered[0].types[i] } })]; 
  }

  private getFunctionContext(fn: DirtyFunc, struct?: ArgList): FunctionContext {
    return {
      expectedReturn: fn.expectedReturn ? this.resolveType(fn.expectedReturn) : null,
      args: fn.args.map(x => { return { name: x.name, type: this.resolveType(x.type) } }),
      struct,
      vars: undefined
    }
  }

  private buildDefinitions() {
    for (const [def, structs, funcs] of this.defs.values()) {
      this.pushNewStruct(def.structs, structs);
      for (const func of funcs) {
        const [struct, structargs] = func.struct ? this.inferStructTypes(def.structs, func.struct, func.line) : [undefined, undefined];
        const ctx = this.getFunctionContext(func, structargs);
        if (ctx.struct !== undefined && ctx.struct.length == 0) throw new ParserError(func.line, 'Empty struct is not allowed');
        const fn: PrecalculatedFunc = {
          name: func.name,
          args: ctx.args.map(x => x.type),
          source: [],
          struct,
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