export type SappLiteral = {
  readonly value: string,
  readonly type: SappDef
}

export type SappExpression = {
  readonly id: 'if',
  readonly cond: SappExpression,
  readonly then: SappExpression,
  readonly else: SappExpression
} | {
  readonly id: 'call',
  readonly func: SappExpression | SappFunc,
  readonly args: SappExpression[]
} | {
  readonly id: 'literal',
  readonly value: SappLiteral
} | {
  readonly id: 'group',
  readonly exprs: SappExpression[]
} | {
  readonly id: 'value',
  readonly of: number,
  readonly source: 'struct' | 'args' | 'context'
} | {
  readonly id: 'build',
  readonly args: SappExpression[],
  readonly struct: SappStruct
}

export type SappModuleDescriptor = string[] | 'kernel'
export type SappModuleRoute = `file:${string}` | 'kernel' | 'virtual'

export type SappFunc = {
  readonly name: string,
  readonly args: SappType[],
  readonly struct: SappStruct | null;
  readonly source: SappExpression | `implicit_${string}` | 'ensured',
  readonly return: SappType,
  readonly memberOf: SappDef,
  readonly line: number // Metada for error resolution
}

export type SappStruct = {
  readonly types: SappType[],
  readonly memberOf: SappDef
}

export type SappDef = {
  readonly name: string,
  readonly origin: SappModuleRoute,
  readonly structs: SappStruct[],
  readonly functions: { [name: string]: SappFunc[] }
}

export type SappType = {
  readonly base: SappDef | SappLiteral | SappType[] | { inputs: SappType[], output: SappType }, // Normal type or tuple
  readonly array?: { size?: number }
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

export function compareType(a: SappType, b: SappType): boolean {
  if (!compareArrayData(a, b)) return false;
  if ('value' in a.base) {
    if (!('value' in b.base)) return false;
    return compareDefs(a.base.type, b.base.type) && a.base.value === b.base.value;
  }
  if ('value' in b.base) return false;
  if (Array.isArray(a.base)) {
    if (!Array.isArray(b.base)) return false;
    return compareTypes(a.base, b.base);
  }
  if (Array.isArray(b.base)) return false;
  if ('inputs' in a.base) {
    if (!('inputs' in b.base)) return false;
    return compareTypes(a.base.inputs, b.base.inputs) && compareType(a.base.output, b.base.output);
  }
  if ('inputs' in b.base) return false;
  // Can not be two equal named definitions in the same origin
  return compareDefs(a.base, b.base);
}

export function compareTypes(a: SappType[], b: SappType[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => compareType(v, b[i]));
}

export function sappTypeRepr(type: SappType): string {
  let repr = "";
  if (Array.isArray(type.base))
    repr += '[' + type.base.map(sappTypeRepr).join(',') + ']';
  else if ('value' in type.base)
    repr += type.base.value;
  else if ('inputs' in type.base)
    repr += '[' + type.base.inputs.map(sappTypeRepr).join(',') + ']:' + sappTypeRepr(type.base.output);
  else repr += `${type.base.origin}.${type.base.name}`;
  if (type.array) {
    repr += '{';
    if (type.array.size) repr += type.array.size.toString();
    repr += '}';
  }
  return repr;
}

export function sappTypeOf(obj: SappFunc | SappDef | SappStruct | SappLiteral): SappType {
  if ('types' in obj) return sappTypeOf(obj.memberOf);
  if ('type' in obj) return sappTypeOf(obj.type);
  if ('functions' in obj) return { base: obj };
  return { base: { inputs: inputsOf(obj), output: obj.return } };
}

export function inputsOf(func: SappFunc): SappType[] {
  const inputs = [...func.args];
  if (func.struct) inputs.unshift(sappTypeOf(func.struct));
  return inputs;
}