import { ModuleProvider } from './module_provider.ts';
import { ModuleGenerator } from './module_generator.ts';

export interface Compiler {
  createGenerator(): ModuleGenerator;
  compile(provider: ModuleProvider, file: string): Promise<Uint8Array>;
}