# Proposal

So I am writing a few WGSL compute shaders to compute ordinary least squares in
a few passed in a non blocking manner.

## General Overview

- A = XᵀX is done in many smaller steps to avoid atomics or any synchronisation
- B = A⁻¹ is then done in 1 step based on the assumption the operation will be small? If not we should split it up.
- C = BXᵀ I think we can do something similar for this to the first step with B & Xᵀ
- D = Cy

Also
- let k = the number of variables
- let n = the number of observations

### Idea 1 — MultiStep matrix multiplication

A is broken into multiple steps by dividing and conquering, there will likely
be floor(log2(n)) passes, for the first pass there'll be (k, k, n/2) work
groups each work group will output, say the first step looks like this?
(this is pseudo code its mostly written to give an idea of the size, and its
possible some of the index calculations are off)

```wgsl
struct Config { n: u32, k: u32 }
struct Reduce { stride_w: u32 }

@binding(0) var<uniform> config: Config;
@binding(1) var<storage, read>: data_in: array<f32, n * k>;
@binding(2) var<storage, read_write> data_map: array<array<array<f32, n/2>, k>, k>;

@compute @workgroup_size(k, k, ?)
fn mul_apply(@builtin(global_invocation_id) gid: vec3<u32>) {
  // conditional
  let a = data_in[k*(gid.z * 2 + 0) + gid.x];
  let b = data_in[k*(gid.z * 2 + 1) + gid.y];
  data_map[gid.x][gid.y][gid.z] = a * b;
}

@binding(0) var<uniform> config_m: Config;
@binding(1) var<uniform> config_r: Reduce;
@binding(2) var<storage, read>: reduce_r: array<f32>;
@binding(3) var<storage, read_write> reduce_w: array<f32>;

@compute @workgroup(w, k)
fn mul_reduce(@builtin(global_invocation_id) gid: vec3<u32>) {
  // conditional
  let r_id = gid.k*2*stride_w;
  let w_id = gid.k*1*stride_w;
  reduce_w[w_id + gid.x] = reduce_r[r_id] * reduce_r[r_id+1];
}
```

With this
- `mul_apply` is dispatched once (with a workgroup size of 2^ceil(log2(n)-1)
  I think) computing all the multiplications
- `mul_reduce` is dispatched roughly `ceil(log2(n)-1)` times
  - each time stride_w is halved, and the output and input buffers are swapped.
  - dispatched roughly ceil(log2(n)-1) times (or at least until stride_w = k)

In theory `mul_apply` and `mul_reduce` are general enough they can be used
for the subsequent multplication of BXᵀ? I'm not really sure? Maybe I need
to make some more changes to accomodate that.

### Idea 2 — subGroupAdd for reduction

I have since learnt there are a set of operations called [subgroup
operations](https://www.w3.org/TR/WGSL/#subgroup-builtin-functions).

I think they may be a synt

```wgsl
struct Config { n: u32, k: u32 }

@group(0) @binding(0) var<uniform> config: Config;
@group(0) @binding(1) var<storage, read> self: array<f32>; // size n*k
@group(0) @binding(2) var<storage, read_write> selfT_self: array<f32>; // size k^2

@compute @workgroup_size(w, sg, sg)
fn multiply_selfT_self(@builtin(global_invocation_id) gid: vec3<u32>) {
  // condition
  let mul = self[??] * self[??];
  let res = subGroupAdd(mul);
  // ??
  selfT_self[??] = res;
}
```

In javascript (I think, `n` may need to modded by the size of the workgroup)

```js
pipeline.dispatch(Math.ceil(n / w), Math.ceil(k / sg), Math.ceil(k / sg))
```

