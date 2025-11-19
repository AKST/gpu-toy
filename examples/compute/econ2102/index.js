import * as csv from '@common/data/csv.js';
import { initWebGPU } from '@common/webgpu/init.js';
import { createStep, createMapping, initStructArrayBuffer, extractStructArrays } from '@common/webgpu/setup.js';
import { OutputBufferAdapter } from '@common/webgpu/buffer.js';
import { UniformAdapter } from '@common/webgpu/uniforms.js';
import { setupData, loadInitialData, showHtmlLayout, createShader } from './util.js';

// Combined output buffer: 12 contiguous fields
const OUTPUT_FIELDS = 12;
const INIT_LEGACY = 0.00000001
const INIT_COEFF_PHONE = 0.1;
const INIT_COEFF_INTERNET = 0.1;

export class Dispatcher {
  #initData;
  #dataFrame;
  #renderer;

  constructor(inits, df, renderer) {
    this.#initData = inits;
    this.#dataFrame = df;
    this.#renderer = renderer;
  }

  async onMessage(event) {
    try {
      const message = event.data;
      switch (message.kind) {
        case 'action':
          return await this.onAction(message);

        case 'update-knobs':
          this.#renderer.updateUniforms(message.data)
          await this.#renderer.runGPU(this.#dataFrame);
          showLog('done');
          break;

        default:
          return console.log('unknown message', message);
      }
    } catch (e) {
      console.error(e);
    }
  };

  async onAction(message) {
    let source;
    let filename;
    let dropColumns = [];
    let renameColumns = {};

    switch (message.id) {
      case 'download-inputs':
        source = this.#dataFrame;
        filename = 'model-inputs.csv';
        renameColumns = { generatedData: 'fields_corrected' };
        dropColumns = [
          'countryId',
          'computed_technology',
          'computed_capitalSteadyState',
          'computed_capital',
          'computed_output',
        ];
        break;

      case 'download-out':
        source = this.#dataFrame;
        filename = 'all-model-data-points.csv';
        renameColumns = { generatedData: 'fields_corrected' };
        dropColumns = ['countryId'];
        break;

      case 'download-inital-values':
        source = this.#initData;
        filename = 'country-initialisation-values.csv';
        renameColumns = { technology: 'ctfp_1999_or_avg', capital: 'capital_1999' };
        break;

      default:
        return console.log('unknown action', message);
    }

    const dfColDropped = csv.dropColumn(source, dropColumns);
    const dfColRenamed = csv.renameColumn(dfColDropped, renameColumns);
    await csv.downloadFile(dfColRenamed, filename);
  }
}

export class Renderer {
  constructor(device, outputBuffer, steps, uniforms) {
    this.device = device;
    this.outputBuffer = outputBuffer;
    this.steps = steps;
    this.uniforms = uniforms;
  }

  async runGPU(df) {
    try {
      const commandEncoder = this.device.createCommandEncoder();
      const pass = commandEncoder.beginComputePass();
      this.steps.forEach(step => step.loadIntoPass(pass));
      pass.end();

      const mapping = this.outputBuffer.createMapping(this.device, commandEncoder);
      this.device.queue.submit([commandEncoder.finish()]);
      await mapping.read();

      extractStructArrays(this.outputBuffer.cpuBuffer, [
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

  updateUniforms(data) {
    this.uniforms.exo.update('alpha', data.alpha);
    this.uniforms.exo.update('saving', data.saving);
    this.uniforms.exo.update('depreciation', data.depreciation);
    this.uniforms.eff.update('phoneEffect', data.phoneEffect);
    this.uniforms.eff.update('phoneInternet', data.phoneInternet);
    this.uniforms.eff.update('phoneEffect_pc', data.phoneEffect_pc);
    this.uniforms.eff.update('phoneInternet_pc', data.phoneInternet_pc);
    this.uniforms.cfg.update('use_fixed_params', data.useFixedParams ? 1 : 0);

    this.uniforms.exo.updateBuffer(this.device);
    this.uniforms.eff.updateBuffer(this.device);
    this.uniforms.cfg.updateBuffer(this.device);
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

try {
  sendInitialisationMessage();
  const { device } = await initWebGPU();
  const layoutPromise = showHtmlLayout();
  const shaderPromise = createShader(device);
  const initialData = await loadInitialData();
  const [size, groups, df, inits] = setupData(initialData);
  const countries = csv.getSize(inits);
  const uniformCfg = UniformAdapter.create([
    { type: 'u32', size: 4, init: 25, name: 'year_per_country' },
    { type: 'u32', size: 4, init: size, name: 'observations' },
    { type: 'u32', size: 4, init: countries, name: 'countries' },
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

  showLog('Observations:', size);
  showLog('Countries:', countries);
  device.pushErrorScope('validation');

  const { COPY_DST, COPY_SRC } = GPUBufferUsage;
  const bufferCountryConfig = initStructArrayBuffer(device, [
    inits.offsets,
    inits.capital,
    inits.technology,
  ], COPY_DST);

  const outputBuffer = OutputBufferAdapter.create(device, size * OUTPUT_FIELDS);
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
  const shaderModule = await shaderPromise;

  const step1 = createStep({
    device,
    shaderModule,
    uniforms: [
      { binding: 1, resource: { buffer: bufferUnifEff } },
      { binding: 2, resource: { buffer: bufferUnifCfg } },
    ],
    workGroups: Math.ceil(size / 64),
    entryPoint: 'step1',
    entries: [
      { binding: 0, resource: { buffer: bufferCountryConfig } },
      { binding: 10, resource: { buffer: outputBuffer.gpuBuffer } },
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
    workGroups: [countries, 3, 1],
    entryPoint: 'step2',
    entries: [
      { binding: 0, resource: { buffer: bufferCountryConfig } },
      { binding: 10, resource: { buffer: outputBuffer.gpuBuffer } },
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
    workGroups: [Math.ceil(size / 64), 3, 1],
    entryPoint: 'step3',
    entries: [
      { binding: 0, resource: { buffer: bufferCountryConfig } },
      { binding: 10, resource: { buffer: outputBuffer.gpuBuffer } },
      { binding: 30, resource: { buffer: bufferPrimaryTimeSeries } },
    ],
  });

  const uniforms = {
    exo: uniformExo,
    eff: uniformEff,
    cfg: uniformCfg,
  };
  const renderer = new Renderer(device, outputBuffer, [step1, step2, step3], uniforms);
  const dispatcher = new Dispatcher(inits, df, renderer);
  window.addEventListener('message', message => dispatcher.onMessage(message));
  await renderer.runGPU(df);

  const errorScope = await device.popErrorScope();
  if (errorScope) {
    console.error('GPU:',errorScope.message);
    showLog('error', errorScope.message);
    console.info(errorScope);
  } else {
    showLog('done');
  }

  await layoutPromise;
} catch (e) {
  console.error(e);
}
