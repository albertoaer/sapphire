import { sapp, parser, DefinitionBuilder, ModuleEnv } from "./common.ts";
import { DefinitionGenerator } from "./definition.ts";
import { EnsuredDefinitionGenerator } from "./ensured_definition.ts";

export interface DefFactory {
  create(parsed: parser.Def): DefinitionBuilder;
}

export class DefaultDefFactory implements DefFactory {
  constructor(private readonly env: ModuleEnv, private readonly route: sapp.ModuleRoute) { }

  create(parsed: parser.Def): DefinitionBuilder {
    if (parsed.ensured) return new EnsuredDefinitionGenerator(this.route, this.env, parsed);
    else return new DefinitionGenerator(this.route, this.env, parsed);
  }
}