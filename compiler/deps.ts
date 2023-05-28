import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
import { ModuleProvider, Generator } from './generator/generator.ts';
import { Module, ModuleDescriptor, ModuleRoute } from "./sapp.ts";
import { IOError } from './errors.ts';

export const SAPP_FILE_EXTENSION = '.sa';
const FILE_PREFIX = 'file:';

export class FileSystemModuleProvider implements ModuleProvider {
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

  getRoute(requester: ModuleRoute, descriptor: ModuleDescriptor): ModuleRoute {
    return `file:${this.assertFileRoute(requester, descriptor)}`;
  }
  
  getModule(requester: ModuleRoute, descriptor: ModuleDescriptor, generator: Generator): Module {
    const route = this.assertFileRoute(requester, descriptor);
    const source = new TextDecoder().decode(Deno.readFileSync(route));
    return generator.generateModule(`file:${route}`, source.toString());
  }
}