import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { ieee754 } from './encoding.ts';

Deno.test('ieee754', () => {
  assertEquals(ieee754(-3748, 32), [0, 0x40, 0x6a, 0xc5]);
  assertEquals(ieee754(9989.467, 32), [0xde, 0x15, 0x1c, 0x46]);
  assertEquals(ieee754(46545.9112, 32), [0xe9, 0xd1, 0x35, 0x47]);
  assertEquals(ieee754(-34541544.5, 32), [0xfa, 0xc3, 0x03, 0xcc]);
  assertEquals(ieee754(-34541544.5, 64), [0, 0, 0, 0x44, 0x7f, 0x78, 0x80, 0xc1]);
  assertEquals(ieee754(98756783848322.544656, 64), [0xa3, 0xe0, 0x4e, 0xc1, 0x66, 0x74, 0xd6, 0x42]);
});