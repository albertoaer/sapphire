import { Parser, IOParserSupport } from './parser/parser.ts';

export interface Compiler {
  compile(file: string): Uint8Array;
}

export class WasmCompiler implements Compiler {
  private readonly parser: Parser;

  constructor(io: IOParserSupport) {
    this.parser = new Parser(io);
  }

  compile(file: string): Uint8Array {
    const module = this.parser.parseModule([file]);
    console.log(module);
    return new Uint8Array();
  }
}