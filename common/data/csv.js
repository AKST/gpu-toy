/**
 * @import { RowDefinition, Frame, GroupedFrame } from './type.ts';
 */

/**
 * Returns a record with series for each column.
 *
 * @param {string} text
 * @param {{ headers: RowDefinition[] }} cfg
 * @returns {{ size: number, df: Frame }}
 */
export function processCsv(text, { headers, dropRows = 0 }) {
  const cleanCell = s => s?.replace(/\"/g, '');
  const lines = text.trim().split('\n').slice(dropRows);
  const csvHeaders = lines[0].split(',').map(cleanCell);

  const result = {};
  const columnIndices = {};

  for (const header of headers) {
    if (header.drop) continue;

    const colIndex = csvHeaders.indexOf(header.name);
    if (colIndex === -1) {
      console.warn(`Column ${header.name} not found in CSV`);
      continue
    }

    const key = header.rename || header.name;
    columnIndices[key] = { index: colIndex, type: header.type };
    result[key] = header.type === 'number' ? [] : [];
  }

  // Process data rows
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');

    for (const [key, { index, type }] of Object.entries(columnIndices)) {
      const value = cleanCell(values[index]);
      if (type === 'number') {
        result[key].push(parseFloat(value));
      } else {
        result[key].push(value);
      }
    }
  }

  let size = 0;
  for (const [key, { type }] of Object.entries(columnIndices)) {
    size = result[key].length;
    if (type === 'number') {
      result[key] = new Float64Array(result[key]);
    }
  }

  return { size, df: result };
}

/**
 * First reorders the data (by groupBY then sortBy) then outputs
 * meta data to find the indices to read from a certain group.
 *
 * @param {string} groupBy
 * @param {string} sortBy - a sort within the grouping
 * @param {Frame} frame
 * @returns {GroupedFrame}
 */
export function sortAndIdentifyGroups(groupBy, sortBy, frame) {
  const numRows = frame[Object.keys(frame)[0]].length;

  // Create array of indices with their group and sort values
  const indices = [];
  for (let i = 0; i < numRows; i++) {
    indices.push({
      index: i,
      groupValue: frame[groupBy][i],
      sortValue: frame[sortBy][i],
    });
  }

  // Sort by group first, then by sort column within groups
  indices.sort((a, b) => {
    if (a.groupValue !== b.groupValue) {
      return a.groupValue < b.groupValue ? -1 : 1;
    }
    return a.sortValue < b.sortValue ? -1 : a.sortValue > b.sortValue ? 1 : 0;
  });

  // Build group metadata: track offset and count for each group
  const groupOffsets = new Map();
  const groupValues = [];
  let currentGroup = null;
  let currentOffset = 0;

  indices.forEach((item, idx) => {
    if (item.groupValue !== currentGroup) {
      if (currentGroup !== null) {
        groupOffsets.get(currentGroup).count = idx - currentOffset;
      }
      currentGroup = item.groupValue;
      currentOffset = idx;
      groupOffsets.set(currentGroup, { offset: currentOffset, count: 0 });
      groupValues.push(currentGroup);
    }
  });

  // Set count for the last group
  if (currentGroup !== null) {
    groupOffsets.get(currentGroup).count = numRows - currentOffset;
  }

  // Reorder the frame data according to sorted indices
  const reorderedFrame = {};
  for (const [key, values] of Object.entries(frame)) {
    const isTypedArray = values instanceof Float64Array;
    const newArray = isTypedArray ? new Float64Array(numRows) : new Array(numRows);

    for (let i = 0; i < numRows; i++) {
      newArray[i] = values[indices[i].index];
    }

    reorderedFrame[key] = newArray;
  }

  return {
    frame: reorderedFrame,
    groups: groupOffsets,
    groupValues,
  };
}

/**
 * @param {Frame} frame
 * @param {string} a
 * @param {string} b
 */
export function renameColumn(frame, a, b) {
  frame[b] = frame[a];
  delete frame[a];
}
