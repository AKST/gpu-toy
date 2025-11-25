struct ComputeSize {
  grid: vec3<u32>,
  wg: vec3<u32>,
}

struct OutputItem {
  global_id: vec3<u32>,
  local_id: vec3<u32>,
  workgroup_id: vec3<u32>,
  local_invocation_index: u32,
}

@group(0) @binding(0) var<uniform> size: ComputeSize;
@group(0) @binding(1) var<storage, read_write> output: array<OutputItem>;

/**
 * This shader exists to debug the nature of how workgroups are
 * formed and the shape they take.
 */
@compute @workgroup_size(1)
fn workgroup_experiment(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_index) lii: u32,
) {
  let index = gid.x
            + gid.y * size.grid.x
            + gid.z * size.grid.x * size.grid.y;
  output[index] = OutputItem(gid, lid, wid, lii);
}
