import { ParserError } from "./common.ts";
import * as tree from './tree.ts';
import {
  DirtyExpression, FunctionValidator, ArgList, ExpectReturn, includeExpectReturn, InProgressFunc
} from './functionValidator.ts';
export * from './functionValidator.ts';

export type DirtyType = Omit<tree.SappType, 'base'> & {
  base: string[] | tree.SappLiteral | DirtyType[],
  line: number
}

export type DirtyArgList = {
  name: string | null,
  type: DirtyType
}[]

export type DirtyHeuristicList = {
  name: string | null,
  type: DirtyType | null
}[]

export type DirtyStruct = Omit<tree.SappStruct, 'types' | 'memberOf'> & { types: DirtyType[], line: number }

export type DirtyFunc = Omit<tree.SappFunc, 'args' | 'source' | 'return' | 'struct' | 'memberOf'> & {
  source: DirtyExpression,
  args: DirtyArgList,
  struct?: DirtyHeuristicList,
  return?: DirtyType
}

type FunctionOverloads = { [name: string]: {
  args: tree.SappType[]
}[] } // Ensures only one function with the same name and args

type MethodOverloads = { [name: string]: {
  args: tree.SappType[],
  line: number, // first occurrence
  structs: tree.SappStruct[] // already matched structs
  expectReturn: ExpectReturn
}[] } // Ensures as many functions with the same name and args per struct

export class ModuleGenerator {
  private readonly globals: Map<string, tree.SappModule | tree.SappDef> = new Map();
  private readonly defs: Map<string, [tree.SappDef, DirtyStruct[], DirtyFunc[]]> = new Map();
  private readonly funcs: InProgressFunc[] = [];

  constructor(
    private readonly route: tree.SappModuleRoute,
    private readonly req?: (descriptor: tree.SappModuleDescriptor) => tree.SappModule | undefined
  ) {
    if (req) {
      const kernel = req('kernel');
      if (kernel) this.globals.set('kernel', kernel);
    }
  }

  useMod(route: string[], into: boolean, line: number, importName?: string) {
    if (route.length === 0) throw new ParserError(line, 'Invalid route');
    if (this.req) {
      const mod = this.req(route);
      if (mod) {
        if (into) for (const [name, def] of Object.entries(mod.defs))
          this.globals.set(name, def);
        else this.globals.set(importName ?? route.at(-1) as string, mod);
      } else throw new ParserError(line, 'Module not found');
    } else throw new ParserError(line, 'Rquesting modules is disabled');
  }

  getMod(name: string): tree.SappModule | undefined {
    const mod = this.globals.get(name);
    if (mod && 'route' in mod) return mod;
  }

  addDef(name: string, structs: DirtyStruct[], funcs: DirtyFunc[]) {
    this.defs.set(name, [{
      name,
      origin: this.route,
      functions: {},
      structs: []
    }, structs, funcs]);
  }

  private globalName(name: string): tree.SappDef | tree.SappModule | undefined {
    return this.defs.get(name)?.[0] ??
      (this.globals.get('kernel') as tree.SappModule | undefined)?.defs[name] ??
      this.globals.get(name);
  }

  private resolveType({ array, base, line }: DirtyType): tree.SappType {
    if ('type' in base) return { array, base };
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
      return { array, base: tp }
    } else return { array, base: (base as DirtyType[]).map(this.resolveType.bind(this)) }
  }

  /**
   * Collect all the dirty structs as structs without repeats
   */
  private collectStructs(def: tree.SappDef, dirties: DirtyStruct[]): tree.SappStruct[] {
    const structs: tree.SappStruct[] = [];
    for (const dirty of dirties) {
      const struct = { types: dirty.types.map(this.resolveType.bind(this)), memberOf: def };
      if (structs.find(x => tree.compareTypes(x.types, struct.types)))
        throw new ParserError(dirty.line, 'Repeated struct');
      structs.push(struct);
    }
    return structs;
  }

  /**
   * Return the struct and arglist from the heuristic list matching types and unknown types
   * Ambiguity and mismatch are taken into account
   */
  private inferStructTypes(
    structs: tree.SappStruct[],
    fields: DirtyHeuristicList,
    line: number
  ): [tree.SappStruct, ArgList] {
    const splitted = fields.map(
      x => [x.name, x.type ? this.resolveType(x.type) : null] as [string | null, tree.SappType | null]
    );
    const filtered = structs.filter(x => x.types.length === fields.length &&
      x.types.every((v, i) => splitted[i][1] === null || tree.compareType(v, splitted[i][1] as tree.SappType)));
    if (filtered.length === 0) throw new ParserError(line, 'Struct mismatch');
    if (filtered.length > 1) throw new ParserError(line, 'Struct ambiguity');
    return [filtered[0], splitted.map((v, i) => { return { name: v[0], type: filtered[0].types[i] } })]; 
  }

  private addMethodOverload(overloads: MethodOverloads, func: InProgressFunc, struct: tree.SappStruct) {
    if (!(func.name in overloads)) overloads[func.name] = [
      { args: func.args, structs: [struct], line: func.line, expectReturn: { type: func.return ?? null } }
    ];
    else {
      const ov = overloads[func.name].find(x => tree.compareTypes(x.args, func.args));
      if (!ov) overloads[func.name].push({
        args: func.args, structs: [struct], line: func.line, expectReturn: { type: func.return ?? null } 
      });
      else {
        if (ov.structs.includes(struct))
          throw new ParserError(func.line, 'Repeated function overload for struct');
        includeExpectReturn(ov.expectReturn, func.line, func.return ?? null);
        ov.structs.push(struct);
      }
    }
  }

  private addFunctionOverload(overloads: FunctionOverloads, func: InProgressFunc) {
    if (!(func.name in overloads)) overloads[func.name] = [ { args: func.args } ];
    else {
      if (overloads[func.name].find(x => tree.compareTypes(x.args, func.args)))
        throw new ParserError(func.line, 'Repeated function overload');
      overloads[func.name].push({ args: func.args });
    }
  }

  /**
   * Collect all the dirty functions as functions without repeats matching the structs
   */
  private collectFunctions(def: tree.SappDef, dirties: DirtyFunc[]) {
    const methods: MethodOverloads = {};
    const funcs: FunctionOverloads = {};
    for (const func of dirties) {
      const [struct, structargs] = func.struct ?
        this.inferStructTypes(def.structs, func.struct, func.line) : [null, undefined];
      const args = func.args.map(x => { return { name: x.name, type: this.resolveType(x.type) } });

      const inProgress: InProgressFunc = {
        name: func.name, struct, args: args.map(x => x.type), line: func.line, memberOf: def
      };
      if (func.return) inProgress.return = this.resolveType(func.return)

      inProgress.validator = new FunctionValidator(this.globals, inProgress, args, structargs, func.source)

      if (struct) this.addMethodOverload(methods, inProgress, struct);
      else this.addFunctionOverload(funcs, inProgress);
      
      if (!(func.name in def.functions)) def.functions[func.name] = [inProgress as tree.SappFunc];
      else def.functions[func.name].push(inProgress as tree.SappFunc);
      
      this.funcs.push(inProgress);
    }
    Object.values(methods).forEach(x => x.forEach(x => {
      if (x.structs.length !== def.structs.length)
        throw new ParserError(x.line, 'Not matched every struct');
    }));
  }

  private buildDefinitions() {
    for (const [def, dirtyStructs, funcs] of this.defs.values()) {
      def.structs.push(...this.collectStructs(def, dirtyStructs));
      this.collectFunctions(def, funcs);
    }
    /*
      At this point for each definition is ensured:
      1 - Structs have the corrects types with no repeats
      2 - Functions have its matching struct assigned or no struct
      3 - Every function overload must have unique type signature
      4 - Every struct should have the same number of overloaded functions
    */
  }

  private validateFunctions() {
    for (const func of this.funcs)
      if (func.validator)
        func.validator.validate();
    for (const func of this.funcs)
      delete func.validator;
  }

  generateModule(): tree.SappModule {
    this.buildDefinitions();
    //this.validateFunctions();
    return {
      defs: Object.fromEntries(Object.entries(this.defs).map(x => [x[0], x[1][0]])),
      route: this.route
    }
  }
}