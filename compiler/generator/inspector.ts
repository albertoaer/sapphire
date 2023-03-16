import { FetchedFuncResult, FuncFetcher, DefFetcher, NameRoute, sapp } from "./common.ts";

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
  constructor(private readonly def: sapp.Def, private readonly owner: sapp.Expression) { }

  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult {
    const id = name.isNext ? name.next : '';
    const manyFuncs = this.def.instanceFuncs.get(id);
    if (manyFuncs) {
      const funcs = manyFuncs.find(x => sapp.typeArrayEquals(x[0].inputSignature, inputSignature));
      if (funcs) return { funcs, owner: this.owner };
      return { route: [this.def.name, id] };
    }
    throw name.meta.error(`Function ${id} does not exists on ${this.def.name}`);
  }
}