import flags from './cli.ts';
import type { Compiler } from './compiler.ts';
import { WasmCompiler, MemoryManager } from './sapp_wasm/mod.ts';
import { FileSystemModuleProvider } from './deps.ts';

if (!flags.file || (!flags.print && !flags.output && !flags.call)) {
  console.log('Nothing to do');
  Deno.exit(-1);
}

const fsp = new FileSystemModuleProvider();
const compiler: Compiler = new WasmCompiler(fsp);

const code = compiler.compile(flags.file);

if (flags.print) {
  console.log(...code);
}

if (flags.output) {
  Deno.writeFileSync(flags.output, code);
}

if (flags.call) {
  const imports = {
    console: console
  } as unknown as WebAssembly.Imports;
  MemoryManager.createAndPlace(imports);
  const { instance } = await WebAssembly.instantiate(code, imports);
  const fn = instance.exports[flags.call] as CallableFunction | undefined;
  if (!fn) {
    console.log('Targeted function does not exists');
    Deno.exit(-1);
  }
  console.log(fn(...flags.args));
}