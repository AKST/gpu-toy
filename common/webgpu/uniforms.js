/**
 * @typedef {{ name: string, size: number, init: number }} UniformDef
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
    for (const { name, init, size } of uniformDef) {
      state[name] = init;
      uniforms.push({ name, size });
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
    const data = new Float32Array(this.bufferSize / 4);

    let offset = 0;
    for (const uniform of this.uniforms) {
      const alignment = Math.min(uniform.size, 16);
      offset = Math.ceil(offset / alignment) * alignment;
      const value = this.state[uniform.name];
      const floatOffset = offset / 4;
      if (uniform.size === 4) data[floatOffset] = value;
      offset += uniform.size;
    }

    device.queue.writeBuffer(buffer, 0, data);
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
