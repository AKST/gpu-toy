export class OutputBufferAdapter {
  #cpuBuffer;
  #gpuBuffer;

  constructor(cpuBuffer, gpuBuffer) {
    this.#cpuBuffer = cpuBuffer;
    this.#gpuBuffer = gpuBuffer;
  }

  static create(device, size) {
    const { COPY_DST, COPY_SRC, STORAGE } = GPUBufferUsage;
    const cpuBuffer = new Float32Array(new Array(size).fill(0));
    const gpuBuffer = device.createBuffer({
      size: size * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | COPY_SRC | COPY_DST,
    });
    device.queue.writeBuffer(gpuBuffer, 0, cpuBuffer);
    return new OutputBufferAdapter(cpuBuffer, gpuBuffer);
  }

  get cpuBuffer () {
    return this.#cpuBuffer;
  }

  get gpuBuffer () {
    return this.#gpuBuffer;
  }

  createMapping(device, commandEncoder) {
    const bufferSize = this.#cpuBuffer.length * Float32Array.BYTES_PER_ELEMENT;
    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    commandEncoder.copyBufferToBuffer(this.#gpuBuffer, 0, stagingBuffer, 0, bufferSize);

    const read = async () => {
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      this.#cpuBuffer.set(new Float32Array(stagingBuffer.getMappedRange()));
      stagingBuffer.unmap();
    };

    return { read, stagingBuffer };
  }
}
