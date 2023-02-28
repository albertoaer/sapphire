import { join, isAbsolute } from "https://deno.land/std@0.177.0/path/mod.ts";
import { ModuleProvider, Generator } from './generator/generator.ts';
import { Module, ModuleDescriptor, ModuleRoute } from "./sapp.ts";
import { IOError } from './errors.ts';

export const SAPP_FILE_EXTENSION = '.sa';

export class FileSystemModuleProvider implements ModuleProvider {
  private assertFileRoute(parts: string[]): string {
    const partial = join(...parts);
    let fileRoute = (isAbsolute(partial) ? partial : join(Deno.cwd(), partial));
    if (!fileRoute.endsWith(SAPP_FILE_EXTENSION)) fileRoute += SAPP_FILE_EXTENSION;
    try {
      if (!Deno.statSync(fileRoute).isFile) throw new IOError('Expecting file to import');
    } catch (_) {
      throw new IOError(`Cannot find: ${fileRoute}`);
    }
    return fileRoute;
  }

  getRoute(descriptor: ModuleDescriptor): ModuleRoute {
    return `file:${this.assertFileRoute(descriptor)}`;
  }
  
  getModule(descriptor: ModuleDescriptor, generator: Generator): Module {
    const route = this.assertFileRoute(descriptor);
    const source = new TextDecoder().decode(Deno.readFileSync(route));
    return generator.generateModule(`file:${route}`, source.toString());
  }
}