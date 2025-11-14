/**
 * @typedef {{ name: string, size: number, init: number, type?: 'f32' | 'u32' }} UniformDef
 */

export class UniformAdapter {
  /**
   * @param {Omit<UniformDef, 'init'>[]} uniforms
   * @param {Record<string, number>} state
   */
  constructor(uniforms, state) {
    this.uniforms = uniforms;
    this.state = state;
  }

  /**
   * @param {UniformDef[]} uniformDef
   */
  static create(uniformDef) {
    const state = {};
    const uniforms = [];
    for (const { name, init, size, type } of uniformDef) {
      state[name] = init;
      uniforms.push({ name, size, type: type || 'f32' });
    }
    return new UniformAdapter(uniforms, state);
  }

  /**
   * @returns {number}
   */
  get bufferSize() {
    let offset = 0;
    for (const uniform of this.uniforms) {
      const alignment = Math.min(uniform.size, 16);
      offset = Math.ceil(offset / alignment) * alignment;
      offset += uniform.size;
    }
    return Math.ceil(offset / 16) * 16;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  update(key, value) {
    this.state[key] = value;
  }

  /**
   * @param {GPUDevice} device
   * @param {GPUBuffer} buffer
   */
  updateBuffer(device, buffer) {
    const arrayBuffer = new ArrayBuffer(this.bufferSize);
    const dataAsFloat = new Float32Array(arrayBuffer);
    const dataAsUint = new Uint32Array(arrayBuffer);

    let offset = 0;
    for (const uniform of this.uniforms) {
      const alignment = Math.min(uniform.size, 16);
      offset = Math.ceil(offset / alignment) * alignment;
      const value = this.state[uniform.name];
      const idx = offset / 4;

      if (uniform.size === 4) {
        if (uniform.type === 'u32') {
          dataAsUint[idx] = value;
        } else {
          dataAsFloat[idx] = value;
        }
      }
      offset += uniform.size;
    }

    device.queue.writeBuffer(buffer, 0, arrayBuffer);
  }

  /**
   * @param {GPUDevice} device
   * @return {GPUBuffer}
   */
  createBuffer(device) {
    const buffer = device.createBuffer({
      size: this.bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateBuffer(device, buffer);
    return buffer;
  }
}
