import * as parser from '../module_parser.ts';
export * as parser from '../module_parser.ts';
import * as sapp from '../sapp.ts';
export * as sapp from '../sapp.ts';
export { ParserError } from '../common.ts';

export interface ResolutionEnv {
  resolveType(raw: parser.Type): sapp.Type;

  getObject(route: parser.ParserRoute): sapp.Object;
}