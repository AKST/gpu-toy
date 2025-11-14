export function createBuffer(device, data, flag) {
  const buffer = device.createBuffer({
    size: data.length * data.constructor.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE | flag,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
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
      pass.dispatchWorkgroups(workGroups);
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
