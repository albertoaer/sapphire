import * as parser from '../parser/common.ts';
export * as parser from '../parser/common.ts';
import * as sapp from '../sapp.ts';
export * as sapp from '../sapp.ts';

export class NameRoute {
  private current = 0;

  constructor(private readonly route: parser.ParserRoute) { }

  get meta(): parser.ParserMeta {
    return this.route.meta;
  }

  get isNext(): boolean {
    return !!this.route.route[this.current];
  }

  get next(): string {
    if (!this.isNext) throw this.meta.error('Empty route');
    return this.route.route[this.current++];
  }

  discardOne() {
    if (this.current <= 0) throw this.meta.error('Invalid route manipulation');
    this.current--;
  }
}

export interface DefinitionBuilder {
  readonly self: sapp.Type;
  readonly isPrivate: boolean;
  build(): sapp.Def;
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc;
}

export interface FunctionBuilder {
  readonly func: sapp.Func;
  readonly isPrivate: boolean;
  readonly inputs: sapp.Type[];
}

export type FetchedInstanceFunc = {
  funcGroup: sapp.Func[],
  owner: sapp.Expression
}

export abstract class ModuleEnv {
  resolveType(tp: parser.Type): sapp.Type {
    const array = tp.array ? (tp.array.size ?? sapp.ArraySizeAuto) : undefined;
    if ('type' in tp.base) return new sapp.Type(tp.base.type, array);
    
    if (Array.isArray(tp.base)) return new sapp.Type(tp.base.map(x => this.resolveType(x)), array);
  
    const unexpectChild = (name: string, n: string[]) => {
      if (n.length > 1) throw tp.meta.error(`${name} has no childs`)
    };
  
    const root = tp.base.route[0];
    if (sapp.isNativeType(root)) {
      unexpectChild(root, tp.base.route);
      return new sapp.Type(root, array);
    }
    if (root === 'void') {
      unexpectChild(root, tp.base.route);
      if (array) throw tp.meta.error('Void cannot be an array');
      return sapp.Void;
    }
    if (root === 'any') {
      unexpectChild(root, tp.base.route);
      if (array) throw tp.meta.error('Any cannot be an array');
      return sapp.Any;
    }
  
    return new sapp.Type(this.fetchDef(new NameRoute(tp.base)), array);
  }

  abstract fetchDef(name: NameRoute): sapp.Def;
  abstract fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): sapp.Func | FetchedInstanceFunc;
}

export abstract class DefinitionEnv extends ModuleEnv {
  abstract readonly self: sapp.Type;
  abstract structFor(types: sapp.Type[]): number | undefined;
}

export abstract class FunctionEnv extends DefinitionEnv {
  abstract getValue(name: NameRoute): sapp.Expression;
  abstract setValue(name: NameRoute, tp: sapp.Type): number;

  abstract scoped<T>(action: () => T): T;
}