import { References } from './constants.ts';

export const RawInstructions: { [id: number]: number } = {
  [References.i32_add]: 0x6A,
  [References.i64_add]: 0x7C,
  [References.f32_add]: 0x92,
  [References.f64_add]: 0xA0,

  [References.i32_sub]: 0x6B,
  [References.i64_sub]: 0x7B,
  [References.f32_sub]: 0x93,
  [References.f64_sub]: 0xA1,

  [References.i32_mul]: 0x6C,
  [References.i64_mul]: 0x7E,
  [References.f32_mul]: 0x94,
  [References.f64_mul]: 0xA2,
  
  [References.i32_div]: 0x6D,
  [References.i64_div]: 0x7F,
  [References.f32_div]: 0x95,
  [References.f64_div]: 0xA3,

  [References.i32_rem]: 0x6F,
  [References.i64_rem]: 0x81,
}