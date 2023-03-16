import { FetchedFuncResult, FuncFetcher, DefFetcher, NameRoute, sapp, parser } from "./common.ts";

export class ModuleInspector implements FuncFetcher, DefFetcher {
  constructor(private readonly module: sapp.Module) { }

  fetchDef(name: NameRoute): sapp.Def {
    const id = name.next;
    const def = this.module.defs.get(id);
    if (!def) throw name.meta.error(`Symbol not found: ${id}`);
    return def;
  }
  
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    const def = this.fetchDef(name);
    return getDefFunc(def, name, inputSignature);
  }
}

export class DefInspector implements FuncFetcher, DefFetcher {
  constructor(private readonly def: sapp.Def) { }
  
  fetchDef(name: NameRoute): sapp.Def {
    if (name.isNext) throw name.meta.error(`Unexpected access: ${name.next}`);
    return this.def;
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    return getDefFunc(this.def, name, inputSignature);
  }
}

function getDefFunc(def: sapp.Def, name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
  const id = name.isNext ? name.next : '';
  const funcs = def.funcs.get(id);
  if (funcs) {
    const func = funcs.find(x => sapp.typeArrayEquals(x.inputSignature, inputSignature));
    if (func) return func;
    return { route: [def.name, id] };
  }
  throw name.meta.error(`Function ${id} does not exists on ${def.name}`);
}

export class InstancedDefInspector implements FuncFetcher {
  constructor(private readonly def: sapp.Def, private readonly expr: sapp.Expression) { }

  public static create(defSource: sapp.Def | sapp.Type, expr: sapp.Expression, meta: parser.ParserMeta) {
    if (defSource instanceof sapp.Type) {
      if(defSource.array) throw meta.error('Array is not a definition instance');
      if (typeof defSource.base !== 'object' || !('route' in defSource.base))
        throw meta.error(defSource.base.toString() + ' is not a definition instance');
      return new InstancedDefInspector(defSource.base, expr);
    }
    return new InstancedDefInspector(defSource, expr);
  }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    const id = name.isNext ? name.next : '';
    const manyFuncs = this.def.instanceFuncs.get(id);
    if (manyFuncs) {
      const funcs = manyFuncs.find(x => sapp.typeArrayEquals(
        x[0].inputSignature, [new sapp.Type(this.def), ...inputSignature]
      ));
      if (funcs) return { funcs, owner: this.expr };
      return { route: [this.def.name, id] };
    }
    throw name.meta.error(`Function ${id} does not exists on ${this.def.name}`);
  }
}