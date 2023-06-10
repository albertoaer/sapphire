import { ModuleRoute, ModuleDescriptor, Module } from './sapp.ts';

export interface ModuleProvider {
  getRoute(requester: ModuleRoute, descriptor: ModuleDescriptor): Promise<ModuleRoute>;
  getModule(requester: ModuleRoute, descriptor: ModuleDescriptor): Promise<Module>;
}