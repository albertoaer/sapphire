import * as parser from '../parser/common.ts';
export * as parser from '../parser/common.ts';
import * as sapp from '../sapp.ts';
export * as sapp from '../sapp.ts';
import { NameRoute } from './utils.ts';
export * from './utils.ts';

export type FetchedInstanceFunc = { funcs: sapp.Func[], owner: sapp.Expression }

export type FuncMismatch = { route: string[] }

export type FetchedFuncResult = sapp.Func | FetchedInstanceFunc | FuncMismatch | undefined

export interface FuncFetcher {
  fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult;
}

export interface DefFetcher {
  fetchDef(name: NameRoute): sapp.Def;
}

export type Global = FuncFetcher | DefFetcher;

export interface DefinitionBuilder extends FuncFetcher {
  readonly def: sapp.Def;
  readonly self: sapp.Type;
  readonly isPrivate: boolean;

  build(): void;
}

export interface FunctionBuilder {
  readonly func: sapp.Func;
  readonly isPrivate: boolean;
  readonly inputs: sapp.Type[];
}

export abstract class ModuleEnv implements FuncFetcher, DefFetcher {
  abstract fetchFunc(name: NameRoute, inputSignature: sapp.Type[]): FetchedFuncResult;
  abstract fetchDef(name: NameRoute): sapp.Def;

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
    if (root === 'ref') {
      unexpectChild(root, tp.base.route);
      if (array) throw tp.meta.error('Ref cannot be an array');
      return sapp.ExternRef;
    }
  
    return new sapp.Type(this.fetchDef(new NameRoute(tp.base)), array);
  }
}

export interface DefinitionEnv extends FuncFetcher {
  readonly module: ModuleEnv;

  readonly self: sapp.Type;
  structFor(types: sapp.Type[]): number | undefined;
}

export interface FunctionEnv extends FuncFetcher {
  readonly definition: DefinitionEnv;

  getValue(name: NameRoute): sapp.Expression;
  setValue(name: NameRoute, tp: sapp.Type): number;

  scoped<T>(action: () => T): T;
}