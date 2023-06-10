import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
import { Generator } from './generator/generator.ts';
import { ModuleProvider } from './module_provider.ts';
import { Module, ModuleDescriptor, ModuleRoute } from "./sapp.ts";
import { IOError } from './errors.ts';

export const SAPP_FILE_EXTENSION = '.sa';
const FILE_PREFIX = 'file:';

export class FileSystemModuleProvider implements ModuleProvider {
  constructor(private readonly generator: Generator) { }

  private assertFileRoute(requester: ModuleRoute, parts: string[]): string {
    if (!requester.startsWith(FILE_PREFIX)) {
      throw new IOError('Only filesystem modules can request filesystem routes');
    }
    const partial = path.join(...parts);
    const base = path.dirname(requester.substring(FILE_PREFIX.length));
    let fileRoute = (path.isAbsolute(partial) ? partial : path.join(base, partial));
    if (!fileRoute.endsWith(SAPP_FILE_EXTENSION)) fileRoute += SAPP_FILE_EXTENSION;
    try {
      if (!Deno.statSync(fileRoute).isFile) throw new IOError('Expecting file to import');
    } catch (_) {
      throw new IOError(`Cannot find: ${fileRoute}`);
    }
    return fileRoute;
  }

  getRoute(requester: ModuleRoute, descriptor: ModuleDescriptor): Promise<ModuleRoute> {
    const path: `file:${string}` = `file:${this.assertFileRoute(requester, descriptor)}`;
    return Promise.resolve(path);
  }
  
  async getModule(requester: ModuleRoute, descriptor: ModuleDescriptor): Promise<Module> {
    const route = this.assertFileRoute(requester, descriptor);
    const source = new TextDecoder().decode(await Deno.readFile(route));
    return this.generator.generateModule(`file:${route}`, source.toString(), this);
  }
}