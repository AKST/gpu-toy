struct Config {
  year_per_country: u32,
  observations: u32,
  countries: u32,
  ralph_newton_iterations: u32,
  use_fixed_params: u32,
};

struct Effects {
  phone_fixed_pc: f32,
  net_exp_pc: f32,
  phone_fixed: f32,
  net_exp: f32,
};

struct ModelOutput {
  capital: f32,
  capital_ss: f32,
  output: f32,
}

struct EndogenousTechModelOutput {
  main: ModelOutput,
  technology: f32,
}

struct ComputedState {
  employed: f32,
  ma: EndogenousTechModelOutput,
  mb: EndogenousTechModelOutput,
  mc: ModelOutput,
}

struct CountryConfig {
  idx_offset: u32,
  init_capital: f32,
  init_technology: f32,
}

struct PrimaryTimeSeries {
  alpha: f32,
  saving: f32,
  depreciation: f32,
}

struct AuxiliaryTimeSeries {
  unemployment: f32,
  labour_force: f32,
  mobile_phone_subscription: f32,
  mobile_phone_internet_connections: f32,
  population: f32,
}

@group(1) @binding(0) var<uniform> exo: PrimaryTimeSeries;
@group(1) @binding(1) var<uniform> effects: Effects;
@group(1) @binding(2) var<uniform> config: Config;

@group(0) @binding(0) var<storage, read> country_config: array<CountryConfig>;
@group(0) @binding(10) var<storage, read_write> out: array<ComputedState>;
@group(0) @binding(20) var<storage, read> aux: array<AuxiliaryTimeSeries>;
@group(0) @binding(30) var<storage, read> primary: array<PrimaryTimeSeries>;

/**
 * Uses ralph newton to solve for capital
 * https://en.wikipedia.org/wiki/Newton%27s_method
 *
 * - Basically inline Y into K, creating a simulatenous equation
 * - Move everything on to one side where the other side is zero
 * - Turn the left hand side into a function that takes K as param
 * - Then get a derivative by deriving it by K
 *
 * Knowing this we can brute force different values of K until
 * we get a function that produces zero or a sufficently small
 * number that we are're satisified.
 */
fn ralph_newton_capital(p: PrimaryTimeSeries, k_last: f32, tech: f32, labour: f32) -> f32 {
  var k_init = k_last;
  if (k_last < 0 || k_last != k_last) { k_init = 1.0; }
  if (tech <= 0 || labour <= 0) { return k_init; }

  let scale = max(k_init, 1.0);
  let base_term = 1.0 - p.depreciation;
  let coeff = p.saving * tech * pow(labour, p.alpha) * pow(scale, -p.alpha);
  var k_scaled = 1.0;

  for (var i = 0u; i < config.ralph_newton_iterations; i++) {
    let k_pow_beta = pow(k_scaled, 1.0 - p.alpha);
    let k_pow_neg_alpha = pow(k_scaled, -p.alpha);
    let f = k_scaled - coeff * k_pow_beta - base_term;
    let f_prime = 1.0 - coeff * (1.0 - p.alpha) * k_pow_neg_alpha;

    // If derivative is negative or too small, the Newton step is unreliable
    // In this case, use a fixed point iteration step instead
    var k_new: f32;

    if (f_prime < 0.1) {
      // Fixed point: k_new = coeff * k^(1-α) + base_term
      k_new = coeff * k_pow_beta + base_term;
    } else {
      // Newton-Raphson step with adaptive damping
      let step = f / f_prime;
      let damping = select(0.7, 0.5, f_prime < 0.5);
      k_new = k_scaled - damping * step;
    }

    let k_safe = max(k_new, 0.5);
    if (abs(k_safe - k_scaled) < 1e-6 * max(abs(k_scaled), 1.0)) {
     return k_safe * scale;
    }
    k_scaled = k_safe;
  }

  return k_scaled * scale;
}

/**
 * Computes the steady state at `t` for
 *
 * K(t) = Labour * ((saving*technology)/depreciation)^(1/alpha)
 */
fn capital_steady_state_at(p: PrimaryTimeSeries, employed: f32, technology: f32) -> f32 {
  let numer = p.saving * technology;
  let denom = p.depreciation;
  return employed * pow(numer/denom, 1.0/p.alpha);
}

/**
 * Compute Output, Capital at period t with pre-computed technology.
 */
fn compute_ykt_at(
  p: PrimaryTimeSeries,
  l: f32,
  a: f32,
  last_capital: f32,
) -> vec2<f32> {
  let k = ralph_newton_capital(p, last_capital, a, l);
  let y = a * pow(l, p.alpha) * pow(k, 1 - p.alpha);
  return vec2(y, k);
}

/**
 * Pre-compute linear outputs
 */
@compute @workgroup_size(64)
fn step1(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= config.observations) { return; }

  let aux = aux[idx];
  out[idx].employed = aux.labour_force * (100.0 - aux.unemployment) * (1.0/100.0);

  let country_idx = idx / config.year_per_country;
  let init_tech = country_config[country_idx].init_technology;

  let cellphone_eff = effects.phone_fixed * aux.mobile_phone_subscription;
  let internet_eff = effects.net_exp * aux.mobile_phone_internet_connections;
  out[idx].ma.technology = init_tech + cellphone_eff + internet_eff;

  let cellphone_eff_pc = effects.phone_fixed_pc * (aux.mobile_phone_subscription / aux.population);
  let internet_eff_pc = effects.net_exp_pc * (aux.mobile_phone_internet_connections / aux.population);
  out[idx].mb.technology = init_tech + cellphone_eff_pc + internet_eff_pc;
}

/**
 * Computes output and capital for all models in parallel
 */
@compute @workgroup_size(1, 1, 1)
fn step2(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let country_idx = global_id.x;
  let model_idx = global_id.y;

  if (country_idx >= config.countries) { return; }
  if (model_idx >= 3u) { return; }

  let offset: u32 = country_config[country_idx].idx_offset;
  var last_k: f32 = country_config[country_idx].init_capital;

  for (var i = 0u; i < config.year_per_country; i++) {
    let idx = offset + i;
    let l = out[idx].employed;

    var a: f32;
    if (model_idx == 0u) {
      a = out[idx].ma.technology;
    } else if (model_idx == 1u) {
      a = out[idx].mb.technology;
    } else {
      a = country_config[country_idx].init_technology;
    }

    var yk: vec2<f32>;
    if (config.use_fixed_params == 1u) {
      yk = compute_ykt_at(exo, l, a, last_k);
    } else {
      yk = compute_ykt_at(primary[idx], l, a, last_k);
    }

    last_k = yk.y;

    if (model_idx == 0u) {
      out[idx].ma.main.output = yk.x;
      out[idx].ma.main.capital = yk.y;
    } else if (model_idx == 1u) {
      out[idx].mb.main.output = yk.x;
      out[idx].mb.main.capital = yk.y;
    } else {
      out[idx].mc.output = yk.x;
      out[idx].mc.capital = yk.y;
    }
  }
}

@compute @workgroup_size(64, 1, 1)
fn step3(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  let mid = global_id.y;
  if (idx >= config.observations) { return; }
  if (mid >= 3) { return; }

  var time_series: PrimaryTimeSeries;
  if (config.use_fixed_params == 1u) {
    time_series = exo;
  } else {
    time_series = primary[idx];
  }

  let l = out[idx].employed;
  if (mid == 0u) {
    let a = out[idx].ma.technology;
    out[idx].ma.main.capital_ss = capital_steady_state_at(time_series, l, a);
  } else if (mid == 1u) {
    let a = out[idx].mb.technology;
    out[idx].mb.main.capital_ss = capital_steady_state_at(time_series, l, a);
  } else {
    let a = country_config[idx / config.year_per_country].init_technology;
    out[idx].mc.capital_ss = capital_steady_state_at(time_series, l, a);
  }
}

