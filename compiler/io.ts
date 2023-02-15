import { join, isAbsolute } from "https://deno.land/std@0.177.0/path/mod.ts";
import { IOParserSupport } from './parser/parser.ts';
import { ModuleDescriptor,ModuleRoute } from "./parser/sapp.ts";
import { TokenList, Tokenizer } from "./parser/tokenizer.ts";

class IOError extends Error {
  constructor(msg: string) {
    super(`IO error: ${msg}`);
  }
}

export class DefaultIOParserSupport implements IOParserSupport {
  private readonly tokenizer: Tokenizer = new Tokenizer();

  solveModuleRoute(descriptor: ModuleDescriptor): ModuleRoute {
    if (!Array.isArray(descriptor)) return descriptor;
    const partial = join(...descriptor);
    return `file:${(isAbsolute(partial) ? partial : join(Deno.cwd(), partial))}`;
  }
  
  getModuleTokens(route: ModuleRoute): TokenList {
    if (!route.startsWith('file:')) throw new IOError(`trying to retrieve tokens from ${route}`);
    const file = route.substring('file:'.length);
    console.log(file);
    const data = Deno.readTextFileSync(file);
    return this.tokenizer.getTokenList(data);
  }
}