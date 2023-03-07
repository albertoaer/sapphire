export enum References {
  nop,

  i32_add,
  i64_add,
  f32_add,
  f64_add,

  i32_sub,
  i64_sub,
  f32_sub,
  f64_sub,

  i32_mul,
  i64_mul,
  f32_mul,
  f64_mul,

  i32_div,
  i64_div,
  f32_div,
  f64_div,

  i32_rem,
  i64_rem,

  i32_to_i64,
  i32_to_f32,
  i32_to_f64,

  i64_to_i32,
  i64_to_f32,
  i64_to_f64,

  f32_to_i32,
  f32_to_i64,
  f32_to_f64,

  f64_to_i32,
  f64_to_i64,
  f64_to_f32,

  i32_nqz,
  i64_nqz,

  i32_neg,
  i64_neg,
  f32_neg,
  f64_neg
}