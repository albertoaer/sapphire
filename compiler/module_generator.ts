import { ModuleProvider } from './module_provider.ts';
import { Module, ModuleRoute } from './sapp.ts';

export interface ModuleGenerator {
  generateModule(
    route: ModuleRoute, source: string, provider: ModuleProvider
  ): Promise<Module>;
}