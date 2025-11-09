/**
 * @returns {{
 *   canvas: HTMLCanvasElement,
 *   adapter: GPUAdapter,
 *   device: GPUDevice,
 * }}
 */
export async function initWebGPU() {
  const canvas = document.createElement('canvas');
  canvas.height = 600;
  canvas.width = 600;
  canvas.style.width = '600px';
  canvas.style.height = '600px';

  const container = document.createElement('div');
  container.className = 'container';
  container.appendChild(canvas);
  document.body.appendChild(container);

  const adapter = await navigator.gpu.requestAdapter({
    featureLevel: 'compatibility',
  });
  const device = await adapter.requestDevice();

  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  return {
    canvas,
    adapter,
    device,
  };
}
