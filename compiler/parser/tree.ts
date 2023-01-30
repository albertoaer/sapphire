export type SappLiteral ={
  readonly value: string,
  readonly type: SappDef
}

export type SappExpression = {
  readonly id: string,
  readonly nodes: (SappExpression | SappLiteral | number | SappFunc)[]
}

export type SappModuleDescriptor = string[] | 'kernel'
export type SappModuleRoute = `file:${string}` | 'kernel' | 'virtual'

export type SappFunc = {
  readonly name: string,
  readonly args: SappType[],
  readonly struct: SappStruct | undefined;
  readonly source: SappExpression[] | `implicit_${string}` | 'ensured',
  readonly return: SappType,
  readonly line: number // Metada for error resolution
}

export type SappStruct = {
  readonly types: SappType[]
}

export type SappDef = {
  readonly name: string,
  readonly origin: SappModuleRoute,
  readonly structs: SappStruct[],
  readonly functions: SappFunc[]
}

export type SappType = {
  readonly base: SappDef | SappLiteral | SappType[], // Normal type or tuple
  readonly array?: { size?: number },
  readonly line: number // Metada for error resolution
}

export type SappModule = {
  readonly route: SappModuleRoute,
  readonly defs: { [name: string]: SappDef }
}

function compareDefs(a: SappDef, b: SappDef): boolean {
  return a.name === b.name && a.origin === b.origin;
}

function compareArrayData(a: SappType, b: SappType): boolean {
  if (!!a.array === !!b.array) return a.array?.size == b.array?.size;
  return false;
}

export function compareTypes(a: SappType, b: SappType): boolean {
  if (!compareArrayData(a, b)) return false;
  if ('value' in a.base) {
    if (!('value' in b.base)) return false;
    return compareDefs(a.base.type, b.base.type) && a.base.value === b.base.value;
  }
  if ('value' in b.base) return false;
  if (Array.isArray(a.base)) {
    if (!Array.isArray(b.base)) return false;
    if (a.base.length != b.base.length) return false;
    for (let i = 0; i < a.base.length; i++)
      if (!compareTypes(a.base[i], b.base[i]))
        return false;
    return true;
  }
  if (Array.isArray(b.base)) return false;
  // Can not be two equal named definitions in the same origin
  return compareDefs(a.base, b.base);
}