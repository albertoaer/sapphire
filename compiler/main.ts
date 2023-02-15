import flags from './cli.ts';
import { Compiler } from './compiler.ts';
import { WasmCompiler } from './sapp_wasm/compiler.ts';
import { IOParserSupport } from './parser/parser.ts';
import { DefaultIOParserSupport } from './io.ts';

const io: IOParserSupport = new DefaultIOParserSupport();
const compiler: Compiler = new WasmCompiler(io);

for (const file of flags.files) {
  compiler.compile(file);
}