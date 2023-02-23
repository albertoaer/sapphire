import { join, isAbsolute } from "https://deno.land/std@0.177.0/path/mod.ts";
import { ModuleProvider, Generator } from './generator/generator.ts';
import { Module, ModuleDescriptor, ModuleRoute } from "./sapp.ts";
import { IOError } from './errors.ts';

export class FileSystemModuleProvider implements ModuleProvider {
  constructor(public readonly kernel?: Module) { }

  private assertFileRoute(parts: string[]): string {
    const partial = join(...parts);
    const fileRoute = isAbsolute(partial) ? partial : join(Deno.cwd(), partial);
    if (!Deno.statSync(fileRoute).isFile) throw new IOError('Expecting file to import');
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