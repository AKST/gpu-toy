
/**
 * @param {GPUDevice} device
 * @param {(Uint32Array | Float32Array)[]} arrays
 * @param {number} flag
 */
export function initStructArrayBuffer(device, arrays, flag) {
  const BYTES_PER_ELEMENT = 4;
  const length = arrays[0].length
  let size = BYTES_PER_ELEMENT;

  for (let i = 1; i < arrays.length; i++) {
    if (length !== arrays[i].length) throw new Error();
    size += BYTES_PER_ELEMENT
    if (arrays[i] instanceof Float32Array) continue;
    if (arrays[i] instanceof Uint32Array) continue;
  }

  const arrayBuffer = new ArrayBuffer(size * length);
  const df32 = new Float32Array(arrayBuffer);
  const du32 = new Uint32Array(arrayBuffer);

  for (let i = 0; i < length; i++) {
    for (let j = 0; j < arrays.length; j++) {
      const array = arrays[j];
      const idx = i * (size / 4) + j;
      if (array instanceof Uint32Array) {
        du32[idx] = array[i];
      } else {
        df32[idx] = array[i];
      }
    }
  }

  const buffer = device.createBuffer({
    size: size * length,
    usage: GPUBufferUsage.STORAGE | flag,
  });
  device.queue.writeBuffer(buffer, 0, arrayBuffer);
  return buffer;
}

export function extractStructArrays(structBuffer, outputArrays) {
  const length = outputArrays[0].length;
  const fieldsPerStruct = outputArrays.length;
  const f32View = new Float32Array(structBuffer.buffer || structBuffer);
  const u32View = new Uint32Array(structBuffer.buffer || structBuffer);

  for (let i = 0; i < length; i++) {
    for (let j = 0; j < fieldsPerStruct; j++) {
      const idx = i * fieldsPerStruct + j;
      if (outputArrays[j] instanceof Uint32Array) {
        outputArrays[j][i] = u32View[idx];
      } else {
        outputArrays[j][i] = f32View[idx];
      }
    }
  }
}

export function createStep({
  device,
  shaderModule,
  entryPoint,
  entries,
  workGroups,
  uniforms,
}) {
  let pipeline, bindGroup, bindGroupUniform, loadIntoPass;

  try {
    pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint,
      },
    });

    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });

    bindGroupUniform = uniforms && device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: uniforms,
    });

    loadIntoPass = pass => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      if (bindGroupUniform) {
        pass.setBindGroup(1, bindGroupUniform);
      }
      if (Array.isArray(workGroups)) {
        pass.dispatchWorkgroups(...workGroups);
      } else {
        pass.dispatchWorkgroups(workGroups);
      }
    };
  } catch (error) {
    console.error(error);
    throw error;
  }

  return { loadIntoPass, pipeline, bindGroup, bindGroupUniform };
}

export function createMapping(device, commandEncoder, buffer, out) {
  const ArrayConst = out.constructor
  const bufferSize = out.length * ArrayConst.BYTES_PER_ELEMENT;
  const stagingBuffer = device.createBuffer({
    size: bufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  commandEncoder.copyBufferToBuffer(
    buffer, 0,
    stagingBuffer, 0,
    bufferSize
  );

  const read = async () => {
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    out.set(new ArrayConst(stagingBuffer.getMappedRange()));
    stagingBuffer.unmap();
  };

  return { read, stagingBuffer };
}
