import {
  UniformAdapter,
  OutputBufferAdapter,
  readStructuredData,
} from '@common/webgpu/buffer.js';

const OUTPUT_STRIDE = 1*(3*4) + 3*(4 * 4);
const COMPUTE_SHADER_URL = import.meta.resolve('./shader.wgsl');
const WORKGROUP_REGEX =
  /@workgroup_size\s*\(\s*\d+\s*(?:,\s*\d+\s*(?:,\s*\d+\s*)?)?\)/;


function showLog(...args) {
  window.parent?.postMessage({ kind: 'push-log', log: args });
}

class Config {
  #workgroupSizes;
  #workgroupCount;

  constructor(workgroupSizes, workgroupCount) {
    this.#workgroupSizes = workgroupSizes
    this.#workgroupCount = workgroupCount
  }

  replaceWorkgroup(source) {
    if (this.#workgroupSizes.length > 3 || this.#workgroupSizes.length < 1) {
      throw new Error('invalid workgroup size, '+this.#workgroupSizes.length);
    }
    const replacement = `@workgroup_size(${this.#workgroupSizes.join(', ')})`;
    return source.replace(WORKGROUP_REGEX, replacement);
  }

  rows() {
    const { x, y, z } = this.grid;
    return x * y * z;
  }

  get workgroupSizes() {
    const x = this.#workgroupSizes[0] ?? 1;
    const y = this.#workgroupSizes[1] ?? 1;
    const z = this.#workgroupSizes[2] ?? 1;
    return { x, y, z }
  }

  get workgroupCount() {
    const x = this.#workgroupCount[0] ?? 1;
    const y = this.#workgroupCount[1] ?? 1;
    const z = this.#workgroupCount[2] ?? 1;
    return { x, y, z }
  }

  get grid() {
    const { workgroupSizes: wgs, workgroupCount: wgc } = this;
    return { x: wgs.x * wgc.x, y: wgs.y * wgc.y, z: wgs.z * wgc.z }
  }

  toString() {
    return `Config(workgroupSizes=${
      JSON.stringify(this.workgroupSizes).replace(/\"/g, '')
    }, workgroupCount=${
      JSON.stringify(this.workgroupCount).replace(/\"/g, '')
    }, size=${
      this.rows()
    })`;
  }
}

function * bufferRows(buffer, stride, layout, rows) {
  let readFrom = 0;
  for (let i = 0; i < rows; i++) {
    const row = {};
    readFrom = readStructuredData({
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
      { kind: 'title', title: 'Workgroup Sizes' },
      { kind: 'number', name: 'wgX', label: 'x', init: 4 },
      { kind: 'number', name: 'wgY', label: 'y', init: 2 },
      { kind: 'number', name: 'wgZ', label: 'z', init: 2 },
      { kind: 'title', title: 'Workgroup Counts' },
      { kind: 'number', name: 'sgX', label: 'x', init: 4 },
      { kind: 'number', name: 'sgY', label: 'y', init: 2 },
      { kind: 'number', name: 'sgZ', label: 'z', init: 2 },
    ],
  });

  const config = new Config([4, 2, 2], [4, 2, 2]);
  const { table, shaderCode } = await compute(config);
  showLog("Compute Finished");
  await render(table, preElements(shaderCode, config));

  window.addEventListener('message', async ({ data: message }) => {
    console.log(message);

    if (message.kind === 'update-knobs') {
      const { wgX, wgY, wgZ, sgX, sgY, sgZ } = message.data;
      const config = new Config([wgX, wgY, wgZ], [sgX, sgY, sgZ]);
      const { table, shaderCode } = await compute(config);
      await render(table, preElements(shaderCode, config));
    }
  });
}

export async function render(table, pres) {
  const parser = new DOMParser();
  showLog("Loading Layout");
  const response = await fetch('./layout.html');
  const html = await response.text();
  const doc = parser.parseFromString(html, 'text/html');
  const template = doc.querySelector('#layout');
  document.body.replaceChildren(template.content.cloneNode(true));
  document.querySelector('.wgsl-code-slot').replaceWith(pres.shader);
  document.querySelector('.js-code-slot').replaceWith(pres.js);
  document.querySelector('.table-slot').replaceWith(table);
}

export async function compute(config) {
  showLog(`Running Compute ${config}`);
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
    const { workgroupCount: wgc } = config;
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(wgc.x, wgc.y, wgc.z);
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
  showLog("Loading Shader");
  const response = await fetch(COMPUTE_SHADER_URL);
  const code = config.replaceWorkgroup(await response.text());
  const shader = await device.createShaderModule({ code });

  const uniform = UniformAdapter.create([
    { type: 'vec3<u32>', name: 'grid' },
    { type: 'vec3<u32>', name: 'wg' },
  ]);

  const { workgroupSizes: wgs, grid } = config;
  uniform.update('grid', [grid.x, grid.y, grid.z]);
  uniform.update('wg', [wgs.x, wgs.y, wgs.z]);

  uniform.updateBuffer(device);

  const output = OutputBufferAdapter.create(device, OUTPUT_STRIDE * config.rows());

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

  return Array.from(bufferRows(output.cpuBuffer.buffer, OUTPUT_STRIDE, [
    { type: 'vec3<u32>', name: 'global' },
    { type: 'vec3<u32>', name: 'local' },
    { type: 'vec3<u32>', name: 'workgroup' },
    { type: 'u32', name: 'local_invocation_index' },
  ], config.rows()));
}

async function getGPU() {
  const { navigator } = globalThis;
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter == null) throw new Error('no gpu adapter');
  return await adapter.requestDevice();
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
    { colSpan: 1, label: 'LII', read: 'local_invocation_index' },
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

  for (const column of colHeaders.slice(1)) {
    if (typeof column.read === 'string') continue;
    const [prop, index] = column.read;
    let max = -1;
    for (let i = 0; i < results.length; i++) {
      const next = results[i][prop][index];
      if (next < max) break;
      max = next;
    }
    column.max = max;
  }

  let id = 0;
  for (const row of results) {
    const tr = document.createElement('tr');
    const tdId = document.createElement('td');
    tdId.appendChild(document.createTextNode(id++));
    tr.appendChild(tdId);

    for (const column of colHeaders.slice(1)) {
      let value, color;
      if (typeof column.read === 'string') {
        value = row[column.read];
        color = 'inherit';
      } else {
        const [prop, index] = column.read;
        value = row[prop][index];
        const r = value / column.max;
        color = `
          color-mix(in srgb, #00ffff calc(100% * (1 - ${r})), #ffff00 calc(100% * ${r}))
        `;
      }

      const td = document.createElement('td');
      const text = document.createTextNode(value);
      td.appendChild(text);
      tr.appendChild(td);
      if (value === 0) {
        td.style.opacity = 0.5;
      }
      if (color != null) {
        td.style.color = color;
      }
    }
    table.appendChild(tr);
  }
  return table;
}

function preElements(shaderCode, config) {
  const createSubGroupVar = (t, c) => {
    const span = document.createElement('span');
    span.style.backgroundColor = c;
    span.style.boxSizing = 'content-box';
    span.style.border = `8px ${c} solid`;
    span.style.borderWidth = '2px 8px';
    span.style.fontWeight = '900';
    span.appendChild(document.createTextNode(t));
    return span;
  };

  const preShader = document.createElement('pre');
  const [firstHalf, secondHalf] = shaderCode.split(WORKGROUP_REGEX);
  const wgs = config.workgroupSizes;
  for (const e of [
    document.createTextNode(firstHalf),
    document.createTextNode('@workgroup_size('),
    createSubGroupVar(wgs.x, 'red'),
    document.createTextNode(', '),
    createSubGroupVar(wgs.y, 'blue'),
    document.createTextNode(', '),
    createSubGroupVar(wgs.z, 'green'),
    document.createTextNode(')'),
    document.createTextNode(secondHalf),
  ]) preShader.appendChild(e)

  const preJs = document.createElement('pre');

  const { x, y, z } = config.workgroupCount;
  for (const e of [
    document.createTextNode('pass.dispatchWorkgroups('),
    createSubGroupVar(x, 'red'),
    document.createTextNode(', '),
    createSubGroupVar(y, 'blue'),
    document.createTextNode(', '),
    createSubGroupVar(z, 'green'),
    document.createTextNode(')'),
  ]) preJs.appendChild(e)

  return { js: preJs, shader: preShader };
}


