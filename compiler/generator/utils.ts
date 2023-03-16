import * as parser from '../parser/common.ts';

export class NameRoute {
  private current = 0;

  constructor(private readonly route: parser.ParserRoute, private readonly start: number = 0) {
    this.current = start;
  }

  get meta(): parser.ParserMeta {
    return this.route.meta;
  }

  get isNext(): boolean {
    return !!this.route.route[this.current];
  }

  get next(): string {
    if (!this.isNext) throw this.meta.error('Empty route');
    return this.route.route[this.current++];
  }

  discardOne() {
    if (this.current <= 0) throw this.meta.error('Invalid route manipulation');
    this.current--;
  }

  clone() {
    return new NameRoute(this.route, this.current);
  }

  toString() {
    return this.route.route.join('.');
  }

  consume() {
    return this.route.route.slice(this.start, this.current);
  }
}