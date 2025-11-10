/**
 * @typedef {number[] | Float32Array | Float64Array} DataSource
 */

/**
 * @param {DataSource} data
 * @param {number} index
 * @returns {[number, number]}
 */
export function v2(data, index) {
  return [data[index*2], data[index*2+1]];
}

/**
 * @param {DataSource} data
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
export function v2Minus(data, a, b) {
  return [
    data[a*2] - data[b*2],
    data[a*2+1] - data[b*2+1],
  ];
}

/**
 * @param {DataSource} data
 * @param {number} index
 * @returns {[number, number]}
 */
export function v2Norm(data, index) {
  const [x, y] = data.slice(index, index+2)
  const len = Math.sqrt(x ** 2 + y ** 2);
  return [x/len, y/len];
}
