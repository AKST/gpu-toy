import * as csv from '@common/data/csv.js';
import * as buffer from './buffer.js';

const COMPUTE_SHADER_URL = import.meta.resolve('./compute.wgsl');
const HOUSING_DATA = import.meta.resolve('@data/ols-data/BostonHousing.csv');

export async function main() {
  try {
    const [device, [data, buffer]] = await Promise.all([getGPU(), loadData()]);
    const pipeline = await createPipeline(device, buffer);
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}

async function createPipeline(device, buffer) {
  const response = await fetch(COMPUTE_SHADER_URL);
  const code = await response.text();
  const shader = await device.createShaderModule({ code });
}

async function getGPU() {
  const { navigator } = globalThis;
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter == null) throw new Error('no gpu adapter');
  return await adapter.requestDevice();
}

async function loadData() {
  const response = await fetch(HOUSING_DATA);
  const text = await response.text();
  const data = csv.processCsv(text, {
    headers: [
      { name: 'crim', type: 'number' },
      { name: 'zn', type: 'number' },
      { name: 'indus', type: 'number' },
      { name: 'chas', type: 'number' },
      { name: 'nox', type: 'number' },
      { name: 'rm', type: 'number' },
      { name: 'age', type: 'number' },
      { name: 'dis', type: 'number' },
      { name: 'rad', type: 'number' },
      { name: 'tax', type: 'number' },
      { name: 'ptratio', type: 'number' },
      { name: 'b', type: 'number' },
      { name: 'lstat', type: 'number' },
      { name: 'medv', type: 'number' },
    ],
  });

  const cpuBuffer = buffer.createContiguousArray({
    rows: csv.getSize(data),
    data: { kind: 'cols', cols: data },
    layout: [
      { type: 'f32', name: 'medv' },
      { type: 'f32', name: 'crim' },
      { type: 'f32', name: 'zn' },
      { type: 'f32', name: 'indus' },
      { type: 'f32', name: 'chas' },
      { type: 'f32', name: 'nox' },
      { type: 'f32', name: 'rm' },
      { type: 'f32', name: 'age' },
      { type: 'f32', name: 'dis' },
      { type: 'f32', name: 'rad' },
      { type: 'f32', name: 'tax' },
      { type: 'f32', name: 'ptratio' },
      { type: 'f32', name: 'b' },
      { type: 'f32', name: 'lstat' }
    ],
  });

  return [data, cpuBuffer];
}
