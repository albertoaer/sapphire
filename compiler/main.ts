import flags from './cli.ts';
import { Compiler } from './compiler.ts';
import { WasmCompiler } from './sapp_wasm/compiler.ts';
import { FileSystemModuleProvider } from './deps.ts';

const fsp = new FileSystemModuleProvider();
const compiler: Compiler = new WasmCompiler(fsp);

for (const file of flags.files) {
  compiler.compile(file);
}