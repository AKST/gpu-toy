import * as csv from '@common/data/csv.js';
import { initWebGPU } from '@common/webgpu/init.js';
import { createStep, createMapping, initStructArrayBuffer, extractStructArrays } from '@common/webgpu/setup.js';
import { OutputBufferAdapter } from '@common/webgpu/buffer.js';
import { UniformAdapter } from '@common/webgpu/uniforms.js';
import { setupData, loadInitialData, showHtmlLayout, createShader } from './util.js';

showHtmlLayout().catch(err => {
  console.error(err);
});

const INIT_LEGACY = 0.00000001
const INIT_COEFF_PHONE = 0.1;
const INIT_COEFF_INTERNET = 0.1;

const uniformCfg = UniformAdapter.create([
  { type: 'u32', size: 4, init: 25, name: 'year_per_country' },
  { type: 'u32', size: 4, init: 0, name: 'observations' },
  { type: 'u32', size: 4, init: 0, name: 'countries' },
  { type: 'u32', size: 4, init: 10, name: 'ralph_newton_iterations' },
  { type: 'u32', size: 4, init: 0, name: 'use_fixed_params' },
]);

const uniformExo = UniformAdapter.create([
  { type: 'f32', size: 4, init: 2/3, name: 'alpha' },
  { type: 'f32', size: 4, init: 0.4, name: 'saving' },
  { type: 'f32', size: 4, init: 0.07, name: 'depreciation' },
]);

const uniformEff = UniformAdapter.create([
  { type: 'f32', size: 4, init: INIT_COEFF_PHONE, name: 'phoneEffect_pc' },
  { type: 'f32', size: 4, init: INIT_COEFF_INTERNET, name: 'phoneInternet_pc' },
  { type: 'f32', size: 4, init: INIT_LEGACY, name: 'phoneEffect' },
  { type: 'f32', size: 4, init: INIT_LEGACY, name: 'phoneInternet' },
]);

let device, df, inits, steps;
let outputBuffer;

main().catch(err => {
  console.error(err);
});

export async function main() {
  window.addEventListener('message', onMessage);
  sendInitialisationMessage();

  const initialData = await loadInitialData();
  const result = await initWebGPU();
  const [size, groups, ...others] = setupData(initialData);
  device = result.device;
  [df, inits] = others;
  uniformCfg.update('observations', size);
  uniformCfg.update('countries', csv.getSize(inits));

  showLog('Observations:', csv.getSize(df));
  showLog('Countries:', groups.groupValues.length);
  device.pushErrorScope('validation');

  const { COPY_DST, COPY_SRC } = GPUBufferUsage;
  const bufferCountryConfig = initStructArrayBuffer(device, [
    inits.offsets,
    inits.capital,
    inits.technology,
  ], COPY_DST);

  // Combined output buffer: 12 contiguous fields
  outputBuffer = OutputBufferAdapter.create(device, size * 12);
  steps = await createSteps(device, df, {
    buffers: {
      configBuffer: bufferCountryConfig,
      outputBuffer: outputBuffer.gpuBuffer,
    },
    workGroups: {
      observervations: size,
      clusters: csv.getSize(inits),
    },
  });

  showLog('running GPU');
  await runGPU(df);

  const errorScope = await device.popErrorScope();
  if (errorScope) {
    console.error('GPU:',errorScope.message);
    showLog('error', errorScope.message);
    console.info(errorScope);
  } else {
    showLog('done');
  }
}

/**
 * @param {GPUDevice} device
 * @param {OutputBufferAdapter} outputBuffer
 */
export async function createSteps(device, df, {
  buffers: {
    outputBuffer,
    configBuffer,
  },
  workGroups: {
    observervations,
    clusters,
  },
}) {
  const bufferAuxiliaryTimeSeries = initStructArrayBuffer(device, [
    df.unemployment,
    df.labourForce,
    df.mobilePhoneSubscription,
    df.mobilePhoneInternetConnections,
    df.population,
  ], GPUBufferUsage.COPY_DST);

  const bufferPrimaryTimeSeries = initStructArrayBuffer(device, [
    df.laboursShare,
    df.grossSavingsPct,
    df.avgDepreciation,
  ], GPUBufferUsage.COPY_DST);

  const bufferUnifExo = uniformExo.createBuffer(device);
  const bufferUnifEff = uniformEff.createBuffer(device);
  const bufferUnifCfg = uniformCfg.createBuffer(device);
  const shaderModule = await createShader(device);

  const step1 = createStep({
    device,
    shaderModule,
    uniforms: [
      { binding: 1, resource: { buffer: bufferUnifEff } },
      { binding: 2, resource: { buffer: bufferUnifCfg } },
    ],
    workGroups: Math.ceil(observervations / 64),
    entryPoint: 'step1',
    entries: [
      { binding: 0, resource: { buffer: configBuffer } },
      { binding: 10, resource: { buffer: outputBuffer } },
      { binding: 20, resource: { buffer: bufferAuxiliaryTimeSeries } },
    ],
  });

  const step2 = createStep({
    device,
    shaderModule,
    uniforms: [
      { binding: 0, resource: { buffer: bufferUnifExo } },
      { binding: 2, resource: { buffer: bufferUnifCfg } },
    ],
    workGroups: [clusters, 3, 1],
    entryPoint: 'step2',
    entries: [
      { binding: 0, resource: { buffer: configBuffer } },
      { binding: 10, resource: { buffer: outputBuffer } },
      { binding: 30, resource: { buffer: bufferPrimaryTimeSeries } },
    ],
  });

  const step3 = createStep({
    device,
    shaderModule,
    uniforms: [
      { binding: 0, resource: { buffer: bufferUnifExo } },
      { binding: 2, resource: { buffer: bufferUnifCfg } },
    ],
    workGroups: [Math.ceil(observervations / 64), 3, 1],
    entryPoint: 'step3',
    entries: [
      { binding: 0, resource: { buffer: configBuffer } },
      { binding: 10, resource: { buffer: outputBuffer } },
      { binding: 30, resource: { buffer: bufferPrimaryTimeSeries } },
    ],
  });

  return [step1, step2, step3];
}

async function runGPU(df) {
  try {
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    steps.forEach(step => step.loadIntoPass(pass));
    pass.end();

    const mapping = outputBuffer.createMapping(device, commandEncoder);
    device.queue.submit([commandEncoder.finish()]);
    await mapping.read();

    extractStructArrays(outputBuffer.cpuBuffer, [
      df.employed,
      df.out_a_capital,
      df.out_a_capitalSteadyState,
      df.out_a_output,
      df.out_a_technology,
      df.out_b_capital,
      df.out_b_capitalSteadyState,
      df.out_b_output,
      df.out_b_technology,
      df.out_c_capital,
      df.out_c_capitalSteadyState,
      df.out_c_output,
    ]);

    showLog('Employed results:', [...df.employed.slice(0, 10)]);
    showLog('(C) Output:', [...df.out_c_output.slice(0, 10)]);
    showLog('(B) Output:', [...df.out_b_output.slice(0, 10)]);
    showLog('(A) Output:', [...df.out_a_output.slice(0, 10)]);
    showLog('(B) Technology:', [...df.out_b_technology.slice(0, 10)]);
    showLog('(A) Technology:', [...df.out_a_technology.slice(0, 10)]);
    showLog('(C) Captial:', [...df.out_c_capital.slice(0, 10)]);
    showLog('(B) Captial:', [...df.out_b_capital.slice(0, 10)]);
    showLog('(A) Captial:', [...df.out_a_capital.slice(0, 10)]);
    showLog('(C) Capital ss:', [...df.out_c_capitalSteadyState.slice(0, 10)]);
    showLog('(B) Capital ss:', [...df.out_b_capitalSteadyState.slice(0, 10)]);
    showLog('(A) Capital ss:', [...df.out_a_capitalSteadyState.slice(0, 10)]);
  } catch (e) {
    console.error(e);
  }
}

async function onMessage(event) {
  try {
    const message = event.data;
    switch (message.kind) {
      case 'action':
        return await onAction(message);

      case 'update-knobs':
        return updateUniforms(message.data)

      default:
        return console.log('unknown message', message);
    }
  } catch (e) {
    console.error(e);
  }
}

async function updateUniforms(data) {
  console.log(data);
  uniformExo.update('alpha', data.alpha);
  uniformExo.update('saving', data.saving);
  uniformExo.update('depreciation', data.depreciation);
  uniformEff.update('phoneEffect', data.phoneEffect);
  uniformEff.update('phoneInternet', data.phoneInternet);
  uniformEff.update('phoneEffect_pc', data.phoneEffect_pc);
  uniformEff.update('phoneInternet_pc', data.phoneInternet_pc);
  uniformCfg.update('use_fixed_params', data.useFixedParams ? 1 : 0);
  uniformExo.updateBuffer(device);
  uniformEff.updateBuffer(device);
  uniformCfg.updateBuffer(device);
  await runGPU(df);
  showLog('done');
}

async function onAction(message) {
  switch (message.id) {
    case 'download-inputs':
      return await csv.downloadFile(
        csv.renameColumn(
          csv.dropColumn(df, [
            'countryId',
            'computed_technology',
            'computed_capitalSteadyState',
            'computed_capital',
            'computed_output',
          ]),
          {
            generatedData: 'fields_corrected',
          },
        ),
        'model-inputs.csv',
      );

    case 'download-out':
      return await csv.downloadFile(
        csv.renameColumn(
          csv.dropColumn(df, [
            'countryId',
          ]),
          {
            generatedData: 'fields_corrected',
          },
        ),
        'all-model-data-points.csv',
      );

    case 'download-inital-values':
      return await csv.downloadFile(
        csv.renameColumn(inits, {
          technology: 'ctfp_1999_or_avg',
          capital: 'capital_1999',
        }),
        'country-initialisation-values.csv',
      );

    default:
      return console.log('unknown action', message);
  }
}

function showLog(...args) {
  window.parent?.postMessage({ kind: 'push-log', log: args });
}

function sendInitialisationMessage() {
  window.parent?.postMessage({
    kind: 'register-button',
    label: 'Download Inputs',
    id: 'download-inputs',
  });

  window.parent?.postMessage({
    kind: 'register-button',
    label: 'Download All',
    id: 'download-out',
  });

  window.parent?.postMessage({
    kind: 'register-button',
    label: 'Download Initial Values',
    id: 'download-inital-values',
  });

  window.parent?.postMessage({
    kind: 'register-knobs',
    knobs: [
      { kind: 'boolean', name: 'useFixedParams', label: 'Fixed (𝛼, s, d)', init: false },
      { kind: 'title', title: 'Exogenous Variables' },
      { kind: 'number', name: 'alpha', label: '(𝛼) Alpha', init: 2/3 },
      { kind: 'number', name: 'saving', label: '(s̄) Savings Rate', init: 0.4 },
      { kind: 'number', name: 'depreciation', label: '(d̄) Deprecation Rate', init: 0.07 },
      { kind: 'divider' },
      { kind: 'title', title: 'Fixed Effects' },
      { kind: 'number', name: 'phoneEffect_pc', label: '𝛽 Phone Effect (f(𝛽) = 𝛽𝜑ₜ)', init: INIT_COEFF_PHONE },
      { kind: 'number', name: 'phoneInternet_pc', label: '𝛾 Internet Effect (f(𝛾) = 𝛾𝜓ₜ)', init: INIT_COEFF_INTERNET },
      { kind: 'divider' },
      { kind: 'title', title: 'Fixed Effects (legacy)' },
      { kind: 'number', name: 'phoneEffect', label: '𝛽 Phone Effect (f(𝛽) = 𝛽𝜑ₜ)', init: INIT_LEGACY },
      { kind: 'number', name: 'phoneInternet', label: '𝛾 Internet Effect (f(𝛾) = 𝛾𝜓ₜ)', init: INIT_LEGACY },
    ],
  });
}
