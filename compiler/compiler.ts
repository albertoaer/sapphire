import { ModuleProvider } from './module_provider.ts';
import { Generator } from './generator/generator.ts';

export interface Compiler {
  createGenerator(): Generator;
  compile(provider: ModuleProvider, file: string): Promise<Uint8Array>;
}