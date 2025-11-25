@group(0) @binding(0) var<storage, read> self: array<f32>;
@group(0) @binding(0) var<storage, read_write> selfT_self: array<f32>;

@compute @workgroup_size(256, 14, 14)
fn moment_map(@builtin(global_invocation_id) gid: vec3<u32>) {
  if gid.x >= arrayLength(&rows) { return; }

  let dep = rows[gid.x].row[0];
  var est = rows[gid.x].row;

  xtx_map[gid.y][gid.z] +=

}
