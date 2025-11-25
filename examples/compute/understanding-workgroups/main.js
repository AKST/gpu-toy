import {
  UniformAdapter,
  OutputBufferAdapter,
  readStructuredData,
} from '@common/webgpu/buffer.js';

const COMPUTE_SHADER_URL = import.meta.resolve('./shader.wgsl');
const WORKGROUP_REGEX =
  /@workgroup_size\s*\(\s*\d+\s*(?:,\s*\d+\s*(?:,\s*\d+\s*)?)?\)/;

class Config {
  #workgroups;
  #subgroups;

  constructor(workgroups, subgroups) {
    this.#workgroups = workgroups
    this.#subgroups = subgroups
  }

  replaceWorkgroup(source) {
    if (this.#workgroups.length > 3 || this.#workgroups.length < 1) {
      throw new Error('invalid workgroup size, '+this.#workgroups.length);
    }
    const replacement = `@workgroup_size(${this.#workgroups.join(', ')})`;
    return source.replace(WORKGROUP_REGEX, replacement);
  }

  rows() {
    const { x, y, z } = this.grid;
    return x * y * z;
  }

  get workgroups() {
    const x = this.#workgroups[0] ?? 1;
    const y = this.#workgroups[1] ?? 1;
    const z = this.#workgroups[2] ?? 1;
    return { x, y, z }
  }

  get subgroups() {
    const x = this.#subgroups[0] ?? 1;
    const y = this.#subgroups[1] ?? 1;
    const z = this.#subgroups[2] ?? 1;
    return { x, y, z }
  }

  get grid() {
    const { workgroups: wg, subgroups: sg } = this;
    return { x: wg.x * sg.x, y: wg.y * sg.y, z: wg.z * sg.z }
  }
}

function * bufferRows(buffer, stride, layout, rows) {
  for (let i = 0; i < rows; i++) {
    const row = {};
    const readFrom = i * stride;
    readStructuredData({
      arrayBuffer: buffer,
      layout,
      data: { kind: 'rows', rows: [row] },
      readFrom,
      writeTo: 0,
    });
    yield row;
  }
}

export async function main() {
  window.parent?.postMessage({
    kind: 'register-knobs',
    knobs: [
      { kind: 'title', title: 'Work Groups' },
      { kind: 'number', name: 'wgX', label: 'x', init: 4 },
      { kind: 'number', name: 'wgY', label: 'y', init: 3 },
      { kind: 'number', name: 'wgZ', label: 'z', init: 2 },
      { kind: 'title', title: '"Sub" Groups' },
      { kind: 'number', name: 'sgX', label: 'x', init: 4 },
      { kind: 'number', name: 'sgY', label: 'y', init: 3 },
      { kind: 'number', name: 'sgZ', label: 'z', init: 2 },
    ],
  });

  const config = new Config([4, 3, 2], [4, 3, 2]);
  const { table, shaderCode } = await compute(config);
  await render(table, shaderCode);

  window.addEventListener('message', async ({ data: message }) => {
    console.log(message);

    if (message.kind === 'update-knobs') {
      const { wgX, wgY, wgZ, sgX, sgY, sgZ } = message.data;
      const config = new Config([wgX, wgY, wgZ], [sgX, sgY, sgZ]);
      const { table, shaderCode } = await compute(config);
      await render(table, shaderCode);
    }
  });
}

export async function render(table, shaderCode) {
  const parser = new DOMParser();
  const response = await fetch('./layout.html');
  const html = await response.text();
  const doc = parser.parseFromString(html, 'text/html');
  const template = doc.querySelector('#layout');
  document.body.replaceChildren(template.content.cloneNode(true));
  const pre = document.createElement('pre');
  pre.appendChild(document.createTextNode(shaderCode));
  document.querySelector('.code-slot').replaceWith(pre);
  document.querySelector('.table-slot').replaceWith(table);
}

export async function compute(config) {
  try {
    const device = await getGPU();
    device.pushErrorScope('validation');

    const {
      uniform, output,
      pipeline, bindGroup,
      code: shaderCode,
    } = await createPipeline(device, config);

    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    const { subgroups: sg } = config;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(sg.x, sg.y, sg.z);
    pass.end();

    const errorScope = await device.popErrorScope();
    if (errorScope) {
      console.error('GPU:',errorScope.message);
      console.info(errorScope);
    } else {
      console.log('GPU: now running');
    }

    const results = await readOutput(device, config, commandEncoder, output);
    const table = showOutputTable(results);
    uniform.getBuffer(device).destroy();
    output.gpuBuffer.destroy();
    return { table, shaderCode }
  } catch (e) {
    console.error(e);
  }
}

async function createPipeline(device, config) {
  const response = await fetch(COMPUTE_SHADER_URL);
  const code = config.replaceWorkgroup(await response.text());
  const shader = await device.createShaderModule({ code });

  const uniform = UniformAdapter.create([
    { type: 'vec3<u32>', name: 'grid' },
    { type: 'vec3<u32>', name: 'wg' },
  ]);

  const { workgroups: wg, grid } = config;
  uniform.update('grid', [grid.x, grid.y, grid.z]);
  uniform.update('wg', [wg.x, wg.y, wg.z]);

  uniform.updateBuffer(device);

  const outputStride = 4 * (4 * 3);
  const output = OutputBufferAdapter.create(device, outputStride * config.rows());

  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: shader, entryPoint: 'workgroup_experiment' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform.getBuffer(device) } },
      { binding: 1, resource: { buffer: output.gpuBuffer } },
    ],
  });

  return { code, uniform, output, pipeline, bindGroup };
}

async function readOutput(device, config, commandEncoder, output) {
  const mapping = output.createMapping(device, commandEncoder);
  device.queue.submit([commandEncoder.finish()]);
  await mapping.read();

  const outputStride = 4 * 4 * 3;
  return Array.from(bufferRows(output.cpuBuffer.buffer, outputStride, [
    { type: 'vec3<u32>', name: 'global' },
    { type: 'vec3<u32>', name: 'local' },
    { type: 'vec3<u32>', name: 'workgroup' },
  ], config.rows()));
}

function showOutputTable(results) {
  const topHeaders = [
    { colSpan: 1, label: '' },
    { colSpan: 3, label: 'Global' },
    { colSpan: 3, label: 'Local' },
    { colSpan: 3, label: 'WorkGroup' },
  ];

  const colHeaders = [
    { colSpan: 1, label: 'ID' },
    { colSpan: 1, label: 'x', read: ['global', 0] },
    { colSpan: 1, label: 'y', read: ['global', 1] },
    { colSpan: 1, label: 'z', read: ['global', 2] },
    { colSpan: 1, label: 'x', read: ['local', 0] },
    { colSpan: 1, label: 'y', read: ['local', 1] },
    { colSpan: 1, label: 'z', read: ['local', 2] },
    { colSpan: 1, label: 'x', read: ['workgroup', 0] },
    { colSpan: 1, label: 'y', read: ['workgroup', 1] },
    { colSpan: 1, label: 'z', read: ['workgroup', 2] },
  ];

  const table = document.createElement('table');
  for (const group of [topHeaders, colHeaders]) {
    const tr = document.createElement('tr');
    for (const header of group) {
      const th = document.createElement('th');
      th.colSpan = header.colSpan;
      th.appendChild(document.createTextNode(header.label));
      tr.appendChild(th);
    }
    table.appendChild(tr);
  }

  let id = 0;
  for (const row of results) {
    const tr = document.createElement('tr');
    const tdId = document.createElement('td');
    tdId.appendChild(document.createTextNode(id++));
    tr.appendChild(tdId);

    for (const column of colHeaders.slice(1)) {
      const [prop, index] = column.read;
      const td = document.createElement('td');
      const text = document.createTextNode(row[prop][index]);
      td.appendChild(text);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  return table;
}

async function getGPU() {
  const { navigator } = globalThis;
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter == null) throw new Error('no gpu adapter');
  return await adapter.requestDevice();
}
