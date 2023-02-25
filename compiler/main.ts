import flags from './cli.ts';
import { Compiler } from './compiler.ts';
import { WasmCompiler } from './sapp_wasm/mod.ts';
import { FileSystemModuleProvider } from './deps.ts';

if (!flags.file || (!flags.print && !flags.output && !flags.call)) {
  console.log('Nothing to do');
  Deno.exit(-1);
}

const fsp = new FileSystemModuleProvider();
const compiler: Compiler = new WasmCompiler(fsp);

const code = compiler.compile(flags.file);

if (flags.print) {
  console.log(code);
}

if (flags.output) {
  Deno.writeFileSync(flags.output, code);
}

if (flags.call) {
  const { instance } = await WebAssembly.instantiate(code);
  console.log((instance.exports[flags.call] as CallableFunction)(...flags.args));
}