struct DataRow {
  dependent: f32,
  explanatory: array<f32, 13>,
}

@group(0) @binding(0) var<storage, read> rows: array<DataRow>;
@group(0) @binding(0) var<storage, read> rows: array<DataRow>;

@compute @workgroup_size(256, 1, 1)
fn step_1(@builtin(global_invocation_id) gid: vec3<u32>) {
  if gid.x >= arrayLength(&rows) { return; }

  let row = rows[gid.x];
  let est: array<f32, 14>;
  est[0] = 1.0;
  for (let i = 0; i < 13; i++) est[i+1] = row.explanatory[i];

}
