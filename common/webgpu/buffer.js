/**
 * @import { GpuType } from './type.ts';
 */
class Unreachable extends Error {
  /** @param {never} value */
  constructor(value) { super() }
}

/**
 * @param {GpuType} t
 * @returns {number}
 */
export function sizeOf(t) {
  switch (t) {
    case 'i32':
    case 'u32':
    case 'f32':
      return 4;

    case 'vec2<i32>':
    case 'vec2<u32>':
    case 'vec2<f32>':
      return 4 * 2;

    case 'vec3<i32>':
    case 'vec3<u32>':
    case 'vec3<f32>':
      return 4 * 3;

    case 'vec4<i32>':
    case 'vec4<u32>':
    case 'vec4<f32>':
      return 4 * 4;

    case 'mat3x3<i32>':
    case 'mat3x3<u32>':
    case 'mat3x3<f32>':
      return 4 * 3 * 3;

    case 'mat4x4<i32>':
    case 'mat4x4<u32>':
    case 'mat4x4<f32>':
      return 4 * 4 * 4;

    default:
      throw new Unreachable(t);
  }
}

/**
 * @param {GpuType} t
 * @returns {'f32' | 'i32' | 'u32'}
 */
export function elemOf(t) {
  switch (t) {
    case 'i32':
    case 'vec2<i32>':
    case 'vec3<i32>':
    case 'vec4<i32>':
    case 'mat3x3<i32>':
    case 'mat4x4<i32>':
      return 'i32';

    case 'u32':
    case 'vec2<u32>':
    case 'vec3<u32>':
    case 'vec4<u32>':
    case 'mat3x3<u32>':
    case 'mat4x4<u32>':
      return 'u32';

    case 'f32':
    case 'vec2<f32>':
    case 'vec3<f32>':
    case 'vec4<f32>':
    case 'mat3x3<f32>':
    case 'mat4x4<f32>':
      return 'f32';

    default:
      throw new Unreachable(t);
  }
}

/**
 * @param {GpuType} t
 * @returns {'scalar' | 'vector' | 'DOMMatrix'}
 */
export function shapeOf(t) {
  switch (t) {
    case 'i32':
    case 'u32':
    case 'f32':
      return 'scalar';

    case 'vec2<i32>':
    case 'vec3<i32>':
    case 'vec4<i32>':
    case 'vec2<f32>':
    case 'vec3<f32>':
    case 'vec4<f32>':
    case 'vec2<u32>':
    case 'vec3<u32>':
    case 'vec4<u32>':
      return 'vector';

    case 'mat3x3<u32>':
    case 'mat3x3<i32>':
    case 'mat3x3<f32>':
      throw new Error('not implemented');

    case 'mat4x4<f32>':
    case 'mat4x4<u32>':
    case 'mat4x4<i32>':
      return 'DOMMatrix';

    default:
      throw new Unreachable(t);
  }
}

/**
 * @param {GpuType} t
 * @returns {number}
 */
export function alignmentOf(t) {
  switch (t) {
    case 'i32':
    case 'u32':
    case 'f32':
      return 4;

    case 'vec2<i32>':
    case 'vec2<u32>':
    case 'vec2<f32>':
      return 8;

    case 'vec3<i32>':
    case 'vec3<u32>':
    case 'vec3<f32>':
      return 16;

    case 'vec4<i32>':
    case 'vec4<u32>':
    case 'vec4<f32>':
      return 16;

    case 'mat3x3<i32>':
    case 'mat3x3<u32>':
    case 'mat3x3<f32>':
    case 'mat4x4<i32>':
    case 'mat4x4<u32>':
    case 'mat4x4<f32>':
      return 16;

    default:
      throw new Unreachable(t);
  }
}


/**
 * Reads a cell from a table of data with an
 * ambigious layout and structure.
 *
 * @param {DataFrame} df
 * @param {number} row
 * @param {string} col
 * @returns {any}
 */
function readCell(df, row, col) {
  try {
    switch (df.kind) {
      case 'rows': return df.rows[row][col];
      case 'cols': return df.cols[col][row];
      default: throw new Unreachable(df);
    }
  } catch (e) {
    console.error(row, col, df);
    throw new df;
  }
}

/**
 * Write to a cell from a table of data with an
 * ambigious layout and structure.
 *
 * @param {DataFrame} df
 * @param {number} row
 * @param {string} col
 * @param {any} value
 */
function writeCell(df, row, col, value) {
  switch (df.kind) {
    case 'rows':
      df.rows[row][col] = value;
      break;
    case 'cols':
      df.cols[col][row] = value;
      break;
    default:
      throw new Unreachable(df);
  }
}

/**
 * Writes structured data to an ArrayBuffer with proper alignment
 * @param {{
 *   arrayBuffer: ArrayBuffer,
 *   layout: { name: string, type: GpuType }[],
 *   data: DataFrame,
 *   writeTo: number,
 *   readFrom: number,
 * }} params
 * @returns {number} - final offset after writing
 */
export function writeStructuredData({
  arrayBuffer,
  layout,
  data,
  writeTo,
  readFrom,
}) {
  const dataAsFloat = new Float32Array(arrayBuffer);
  const dataAsUint = new Uint32Array(arrayBuffer);
  const dataAsSint = new Int32Array(arrayBuffer);

  let offset = writeTo;

  for (const field of layout) {
    const fieldSize = sizeOf(field.type);
    const alignment = alignmentOf(field.type);
    offset = Math.ceil(offset / alignment) * alignment;
    const idx = offset / 4;

    const value = readCell(data, readFrom, field.name);
    const shape = shapeOf(field.type);
    const elemType = elemOf(field.type);

    let valueArray;
    switch (shape) {
      case 'scalar':
        valueArray = [value];
        break;
      case 'vector':
        valueArray = value;
        break;
      case 'DOMMatrix':
        valueArray = value.toFloat32Array();
        break;
      default:
        throw new Unreachable(shape);
    }

    switch (elemType) {
      case 'f32':
        dataAsFloat.set(valueArray, idx);
        break;
      case 'u32':
        dataAsUint.set(valueArray, idx);
        break;
      case 'i32':
        dataAsSint.set(valueArray, idx);
        break;
      default:
        throw new Unreachable(elemType);
    }

    offset += fieldSize;
  }

  return offset;
}

/**
 * Reads structured data from an ArrayBuffer with proper alignment
 * @param {{
 *   arrayBuffer: ArrayBuffer,
 *   layout: { name: string, type: GpuType }[],
 *   data: DataFrame,
 *   readFrom: number,
 *   writeTo: number,
 * }} params
 * @returns {number} - final offset after reading
 */
export function readStructuredData({
  arrayBuffer,
  layout,
  data,
  readFrom,
  writeTo,
}) {
  const dataAsFloat = new Float32Array(arrayBuffer);
  const dataAsUint = new Uint32Array(arrayBuffer);
  const dataAsSint = new Int32Array(arrayBuffer);

  let offset = readFrom;

  for (const field of layout) {
    const fieldSize = sizeOf(field.type);
    const alignment = alignmentOf(field.type);
    offset = Math.ceil(offset / alignment) * alignment;
    const idx = offset / 4;

    const shape = shapeOf(field.type);
    const elemType = elemOf(field.type);

    let value;
    switch (shape) {
      case 'scalar': {
        switch (elemType) {
          case 'f32':
            value = dataAsFloat[idx];
            break;
          case 'u32':
            value = dataAsUint[idx];
            break;
          case 'i32':
            value = dataAsSint[idx];
            break;
          default:
            throw new Unreachable(elemType);
        }
        break;
      }
      case 'vector': {
        const length = fieldSize / sizeOf(elemType);
        switch (elemType) {
          case 'f32':
            value = Array.from(dataAsFloat.slice(idx, idx + length));
            break;
          case 'u32':
            value = Array.from(dataAsUint.slice(idx, idx + length));
            break;
          case 'i32':
            value = Array.from(dataAsSint.slice(idx, idx + length));
            break;
          default:
            throw new Unreachable(elemType);
        }
        break;
      }
      case 'DOMMatrix': {
        const length = fieldSize / sizeOf(elemType);
        const matrixData = dataAsFloat.slice(idx, idx + length);
        value = new DOMMatrix(Array.from(matrixData));
        break;
      }
      default:
        throw new Unreachable(shape);
    }

    writeCell(data, writeTo, field.name, value);
    offset += fieldSize;
  }

  return offset;
}

/**
 * Creates a contiguous array buffer from structured data with proper alignment
 * @param {{
 *   rows: number,
 *   data: DataFrame,
 *   layout: FieldDescriptor[],
 * }} config
 * @returns {ArrayBuffer}
 */
export function createContiguousArray({ rows, data, layout }) {
  let stride = 0, maxAlignment = 1;

  for (const field of layout) {
    const fieldSize = sizeOf(field.type);
    const alignment = alignmentOf(field.type);
    maxAlignment = Math.max(maxAlignment, alignment);
    stride = (Math.ceil(stride / alignment) * alignment) + fieldSize;
  }

  stride = Math.ceil(stride / maxAlignment) * maxAlignment;
  const arrayBuffer = new ArrayBuffer(rows * stride);

  for (let i = 0; i < rows; i++) {
    writeStructuredData({
      arrayBuffer,
      layout,
      data,
      writeTo: i * stride,
      readFrom: i,
    });
  }

  return arrayBuffer;
}


/**
 * @param {{
 *   rows: Record<string, any>[],
 *   layout: FieldDescriptor[],
 * }} config
 * @returns {ArrayBuffer}
 */
export function createContiguousArrayFromRows({ rows, layout }) {
  return createContiguousArray({
    rows: rows.length,
    data: { kind: 'rows', rows },
    layout,
  });
}

export class UniformAdapter {
  /** @type {GPUBuffer | undefined} */
  #_internalBuffer = undefined;

  /**
   * @param {{ name: string, type: GpuType }[]} uniforms
   * @param {Record<string, any>} state
   */
  constructor(uniforms, state) {
    this.uniforms = uniforms;
    this.state = state;
  }

  /**
   * @param {GpuTypeDeclare<any>[]} uniformDef
   */
  static create(uniformDef) {
    const state = {};
    const uniforms = [];
    for (const { name, init, type } of uniformDef) {
      // @ts-ignore - problem for later
      state[name] = init;
      uniforms.push({ name, type });
    }
    return new UniformAdapter(uniforms, state);
  }

  /**
   * @returns {number}
   */
  get bufferSize() {
    let offset = 0;
    for (const uniform of this.uniforms) {
      const alignment = alignmentOf(uniform.type);
      offset = Math.ceil(offset / alignment) * alignment;
      offset += sizeOf(uniform.type);
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
   */
  updateBuffer(device) {
    const arrayBuffer = new ArrayBuffer(this.bufferSize);
    this.writeToArrayBuffer(arrayBuffer);
    const internalBuffer = this.getBuffer(device);
    device.queue.writeBuffer(internalBuffer, 0, arrayBuffer);
  }

  /**
   * @param {ArrayBuffer} arrayBuffer
   */
  writeToArrayBuffer(arrayBuffer) {
    writeStructuredData({
      arrayBuffer,
      layout: this.uniforms,
      data: { kind: 'rows', rows: [this.state] },
      writeTo: 0,
      readFrom: 0,
    });
  }

  /**
   * @param {GPUDevice} device
   * @return {GPUBuffer}
   */
  getBuffer(device) {
    if (this.#_internalBuffer == null) {
      this.#_internalBuffer = device.createBuffer({
        size: this.bufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    return this.#_internalBuffer;
  }
}

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
