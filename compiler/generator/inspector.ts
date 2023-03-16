import { FetchedFuncResult, ModuleEnv, NameRoute, sapp } from "./common.ts";

export class ModuleInspector extends ModuleEnv {
  constructor(private readonly module: sapp.Module) {
    super();
  }

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

export class DefInspector extends ModuleEnv {
  constructor(private readonly def: sapp.Def) {
    super();
  }

  fetchDef(name: NameRoute): sapp.Def {
    if (name.isNext) throw name.meta.error(`Cannot retrive a definition from a definition`);
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
    return 'mismatch';
  }
  throw name.meta.error(`Function ${id} does not exists on ${def.name}`);
}