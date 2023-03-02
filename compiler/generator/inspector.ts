import { ParserError } from "../errors.ts";
import { FetchedInstanceFunc, ModuleEnv, NameRoute, sapp } from "./common.ts";

export class ModuleInspector extends ModuleEnv {
  constructor(private readonly module: sapp.Module) {
    super();
  }

  fetchDef(name: NameRoute): sapp.Def {
    const id = name.next;
    const def = this.module.defs.get(id);
    if (!def) throw new ParserError(name.line, `Symbol not found: ${id}`);
    return def;
  }
  
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    const def = this.fetchDef(name);
    return getDefFunc(def, name, inputSignature);
  }
}

export class DefInspector extends ModuleEnv {
  constructor(private readonly def: sapp.Def) {
    super();
  }

  fetchDef(name: NameRoute): sapp.Def {
    if (name.isNext) throw new ParserError(name.line, `Cannot retrive a definition from a definition`);
    return this.def;
  }
  
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc {
    return getDefFunc(this.def, name, inputSignature);
  }
}

function getDefFunc(def: sapp.Def, name: NameRoute, inputSignature: sapp.Type[]): sapp.Func {
  const id = name.isNext ? name.next : '';
  const funcs = def.funcs.get(id);
  if (funcs) {
    const func = funcs.find(
      x => sapp.typeArrayEquals(x.inputSignature, inputSignature)
    );
    if (!func) throw new ParserError(name.line, `Invalid signature for function ${def.name}.${id}(...)`);
    return func;
  }
  throw new ParserError(name.line, `Function ${id} does not exists on ${def.name}`);
}