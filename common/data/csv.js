/**
 * @import { RowDefinition, Frame, GroupedFrame } from './type.ts';
 *
 * @typdef {[string, (a: any) => boolean]} Predicate
 */

const SIZE_SYM = Symbol();

/**
 * @param {Frame} frame
 * @returns {number}
 */
export function getSize(frame) {
  return frame[SIZE_SYM];
}

/**
 * Returns a record with series for each column.
 *
 * @param {string} text
 * @param {{ headers: RowDefinition[] }} cfg
 * @returns {Frame}
 */
export function processCsv(text, { headers, dropRows = 0 }) {
  // Proper CSV parser that handles quoted fields with commas
  const parseCsvLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const lines = text.trim().split('\n').slice(dropRows);
  const csvHeaders = parseCsvLine(lines[0]);

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
    const values = parseCsvLine(lines[i]);

    for (const [key, { index, type }] of Object.entries(columnIndices)) {
      const value = values[index];
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
      result[key] = new Float32Array(result[key]);
    }
  }

  result[SIZE_SYM] = size;
  return result;
}

/**
 * @param {Frame} frame
 * @param {string[]} retain
 * @param {{ key: string, val: string }} outColumns
 * @returns {Frame}
 */
export function wideToLong(frame, retain, outColumns) {
  const allColumns = Object.keys(frame);
  const pivotColumns = allColumns.filter(col => !retain.includes(col));

  const inputRows = frame[allColumns[0]].length;
  const outputSize = inputRows * pivotColumns.length;

  // Initialize output frame
  const result = {};

  // Add retained columns (string arrays)
  for (const col of retain) {
    result[col] = new Array(outputSize);
  }

  // Add key column (will contain pivot column names, converted to numbers if possible)
  result[outColumns.key] = new Array(outputSize);

  // Add value column (numbers)
  result[outColumns.val] = new Float32Array(outputSize);

  // Fill the output frame
  let outIdx = 0;
  for (let row = 0; row < inputRows; row++) {
    for (const pivotCol of pivotColumns) {
      // Copy retained columns
      for (const retainCol of retain) {
        result[retainCol][outIdx] = frame[retainCol][row];
      }

      // Parse pivot column name as key (try to parse as number)
      const keyValue = parseFloat(pivotCol);
      result[outColumns.key][outIdx] = isNaN(keyValue) ? pivotCol : keyValue;

      // Copy value
      result[outColumns.val][outIdx] = frame[pivotCol][row];

      outIdx++;
    }
  }

  // Convert key column to Float32Array if all values are numbers
  const allNumbers = result[outColumns.key].every(v => typeof v === 'number');
  if (allNumbers) {
    result[outColumns.key] = new Float32Array(result[outColumns.key]);
  }

  result[SIZE_SYM] = outputSize;
  return result;
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

  // Build group metadata: track offset, count, min, and max for each group
  const groupOffsets = new Map();
  const groupValues = [];
  let currentGroup = null;
  let currentOffset = 0;

  indices.forEach((item, idx) => {
    if (item.groupValue !== currentGroup) {
      if (currentGroup !== null) {
        const metadata = groupOffsets.get(currentGroup);
        metadata.count = idx - currentOffset;
        metadata.max = indices[idx - 1].sortValue;
      }
      currentGroup = item.groupValue;
      currentOffset = idx;
      groupOffsets.set(currentGroup, {
        offset: currentOffset,
        count: 0,
        min: item.sortValue,
        max: item.sortValue,
      });
      groupValues.push(currentGroup);
    }
  });

  // Set count and max for the last group
  if (currentGroup !== null) {
    const metadata = groupOffsets.get(currentGroup);
    metadata.count = numRows - currentOffset;
    metadata.max = indices[numRows - 1].sortValue;
  }

  // Reorder the frame data according to sorted indices
  const reorderedFrame = {};
  for (const [key, values] of Object.entries(frame)) {
    const isTypedArray = values instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(numRows) : new Array(numRows);

    for (let i = 0; i < numRows; i++) {
      newArray[i] = values[indices[i].index];
    }

    reorderedFrame[key] = newArray;
    reorderedFrame[SIZE_SYM] = newArray.length;
  }


  return {
    frame: reorderedFrame,
    groups: groupOffsets,
    groupValues,
    sortBy,
    groupBy,
  };
}

/**
 * @param {Frame} frame
 * @param {string} a
 * @param {string} b
 */
export function renameColumn(frame, a, b) {
  const frame2 = { ...frame };
  frame2[b] = frame[a];
  delete frame2[a];
  return frame2;
}

/**
 * @param {Frame} frame
 * @param {string} a
 */
export function dropColumn(frame, a) {
  const frame2 = { ...frame };
  delete frame2[a];
  return frame2;
}

/**
 * Drops row that don't match the predicate.
 *
 * @param {Frame} frame
 * @param {string} colname
 * @param {(value: any, index: number) => boolean} p - Predicate function
 * @returns {Frame}
 */
export function filter(frame, colname, p) {
  const allColumns = Object.keys(frame);
  const numRows = frame[colname].length;

  // Find which rows match the predicate
  const keepIndices = [];
  for (let i = 0; i < numRows; i++) {
    if (p(frame[colname][i], i)) {
      keepIndices.push(i);
    }
  }

  const outputSize = keepIndices.length;
  const result = {};

  // Build filtered frame
  for (const col of allColumns) {
    const isTypedArray = frame[col] instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(outputSize) : new Array(outputSize);

    for (let i = 0; i < outputSize; i++) {
      newArray[i] = frame[col][keepIndices[i]];
    }

    result[col] = newArray;
  }

  result[SIZE_SYM] = outputSize;
  return result;
}

/**
 * Drops groups that don't match the predicate.
 *
 * @param {GroupedFrame} grouping
 * @param {{ uniformSize: boolean }} cfg
 * @param {(meta: GroupMetadata) => boolean} p - Predicate function
 * @returns {GroupedFrame}
 */
export function filterGroups(grouping, cfg, p) {
  const { frame, groups, groupValues, sortBy, groupBy } = grouping;

  // Filter groups based on predicate
  const retainedGroups = [];
  for (const groupValue of groupValues) {
    const metadata = groups.get(groupValue);
    if (p(metadata)) {
      retainedGroups.push({ groupValue, metadata });
    }
  }

  if (!cfg.uniformSize) {
    // Just copy the retained groups' data
    const totalRows = retainedGroups.reduce((sum, g) => sum + g.metadata.count, 0);
    const newFrame = {};
    const allColumns = Object.keys(frame).filter(key => typeof key === 'string');

    for (const col of allColumns) {
      const isTypedArray = frame[col] instanceof Float32Array;
      const newArray = isTypedArray ? new Float32Array(totalRows) : new Array(totalRows);
      newFrame[col] = newArray;
    }

    let outIdx = 0;
    const newGroups = new Map();
    const newGroupValues = [];

    for (const { groupValue, metadata } of retainedGroups) {
      const newOffset = outIdx;

      // Copy data for this group
      for (let i = 0; i < metadata.count; i++) {
        for (const col of allColumns) {
          newFrame[col][outIdx] = frame[col][metadata.offset + i];
        }
        outIdx++;
      }

      newGroups.set(groupValue, {
        offset: newOffset,
        count: metadata.count,
        min: metadata.min,
        max: metadata.max,
      });
      newGroupValues.push(groupValue);
    }

    newFrame[SIZE_SYM] = totalRows;

    return {
      frame: newFrame,
      groups: newGroups,
      groupValues: newGroupValues,
      sortBy,
      groupBy,
    };
  } else {
    // Find the global min/max across all retained groups
    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (const { metadata } of retainedGroups) {
      globalMin = Math.min(globalMin, metadata.min);
      globalMax = Math.max(globalMax, metadata.max);
    }

    // Assuming integer steps (e.g., years)
    const expectedSize = Math.floor(globalMax - globalMin) + 1;
    const totalRows = retainedGroups.length * expectedSize;

    const newFrame = {};
    const allColumns = Object.keys(frame).filter(key => typeof key === 'string');

    for (const col of allColumns) {
      const isTypedArray = frame[col] instanceof Float32Array;
      const newArray = isTypedArray ? new Float32Array(totalRows) : new Array(totalRows);
      newFrame[col] = newArray;
    }

    let outIdx = 0;
    const newGroups = new Map();
    const newGroupValues = [];

    for (const { groupValue, metadata } of retainedGroups) {
      const newOffset = outIdx;

      // Build a map of existing sortBy values in this group
      const existingValues = new Map();
      for (let i = 0; i < metadata.count; i++) {
        const srcIdx = metadata.offset + i;
        const sortValue = frame[sortBy][srcIdx];
        existingValues.set(sortValue, srcIdx);
      }

      // Fill in all values from globalMin to globalMax
      for (let sortValue = globalMin; sortValue <= globalMax; sortValue++) {
        const srcIdx = existingValues.get(sortValue);

        if (srcIdx !== undefined) {
          // Copy existing data
          for (const col of allColumns) {
            newFrame[col][outIdx] = frame[col][srcIdx];
          }
        } else {
          // Fill missing data with NaN/null
          for (const col of allColumns) {
            if (col === sortBy) {
              newFrame[col][outIdx] = sortValue;
            } else if (col === groupBy) {
              newFrame[col][outIdx] = groupValue;
            } else {
              const isTypedArray = frame[col] instanceof Float32Array;
              newFrame[col][outIdx] = isTypedArray ? NaN : null;
            }
          }
        }

        outIdx++;
      }

      newGroups.set(groupValue, {
        offset: newOffset,
        count: expectedSize,
        min: globalMin,
        max: globalMax,
      });
      newGroupValues.push(groupValue);
    }

    newFrame[SIZE_SYM] = totalRows;

    return {
      frame: newFrame,
      groups: newGroups,
      groupValues: newGroupValues,
    };
  }
}

/**
 * @param {Frame} left
 * @param {Frame} right
 * @param {string[]} onKeys
 * @returns {Frame}
 */
export function innerJoin(left, right, onKeys) {
  const leftColumns = Object.keys(left);
  const rightColumns = Object.keys(right).filter(col => !onKeys.includes(col));

  const leftRows = left[leftColumns[0]].length;
  const rightRows = right[onKeys[0]].length;

  // Build index for right frame using join keys
  const rightIndex = new Map();
  for (let i = 0; i < rightRows; i++) {
    const key = onKeys.map(k => right[k][i]).join('|');
    if (!rightIndex.has(key)) {
      rightIndex.set(key, []);
    }
    rightIndex.get(key).push(i);
  }

  // Find matches
  const matchedRows = [];
  for (let i = 0; i < leftRows; i++) {
    const key = onKeys.map(k => left[k][i]).join('|');
    const rightMatches = rightIndex.get(key);
    if (rightMatches) {
      for (const rightIdx of rightMatches) {
        matchedRows.push({ leftIdx: i, rightIdx });
      }
    }
  }

  const outputSize = matchedRows.length;
  const result = {};

  // Copy left columns
  for (const col of leftColumns) {
    const isTypedArray = left[col] instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(outputSize) : new Array(outputSize);

    for (let i = 0; i < outputSize; i++) {
      newArray[i] = left[col][matchedRows[i].leftIdx];
    }

    result[col] = newArray;
  }

  // Copy right columns (excluding join keys since they're already in left)
  for (const col of rightColumns) {
    const isTypedArray = right[col] instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(outputSize) : new Array(outputSize);

    for (let i = 0; i < outputSize; i++) {
      newArray[i] = right[col][matchedRows[i].rightIdx];
    }

    result[col] = newArray;
  }

  result[SIZE_SYM] = outputSize;
  return result;
}

/**
 * @param {Frame} left
 * @param {Frame} right
 * @param {string[]} onKeys
 * @returns {Frame}
 */
export function outerJoin(left, right, onKeys) {
  const leftColumns = Object.keys(left);
  const rightColumns = Object.keys(right).filter(col => !onKeys.includes(col));

  const leftRows = left[leftColumns[0]].length;
  const rightRows = right[onKeys[0]].length;

  // Build index for right frame using join keys
  const rightIndex = new Map();
  for (let i = 0; i < rightRows; i++) {
    const key = onKeys.map(k => right[k][i]).join('|');
    if (!rightIndex.has(key)) {
      rightIndex.set(key, []);
    }
    rightIndex.get(key).push(i);
  }

  // Track matched rows
  const matchedRows = [];
  const matchedRightIndices = new Set();

  // Find matches from left
  for (let i = 0; i < leftRows; i++) {
    const key = onKeys.map(k => left[k][i]).join('|');
    const rightMatches = rightIndex.get(key);
    if (rightMatches) {
      for (const rightIdx of rightMatches) {
        matchedRows.push({ leftIdx: i, rightIdx });
        matchedRightIndices.add(rightIdx);
      }
    } else {
      // Left row with no match
      matchedRows.push({ leftIdx: i, rightIdx: null });
    }
  }

  // Add unmatched right rows
  for (let i = 0; i < rightRows; i++) {
    if (!matchedRightIndices.has(i)) {
      matchedRows.push({ leftIdx: null, rightIdx: i });
    }
  }

  const outputSize = matchedRows.length;
  const result = {};

  // Copy left columns
  for (const col of leftColumns) {
    const isTypedArray = left[col] instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(outputSize) : new Array(outputSize);

    for (let i = 0; i < outputSize; i++) {
      const leftIdx = matchedRows[i].leftIdx;
      if (leftIdx !== null) {
        newArray[i] = left[col][leftIdx];
      } else {
        newArray[i] = isTypedArray ? NaN : null;
      }
    }

    result[col] = newArray;
  }

  // Copy right columns (excluding join keys since they're already in left)
  for (const col of rightColumns) {
    const isTypedArray = right[col] instanceof Float32Array;
    const newArray = isTypedArray ? new Float32Array(outputSize) : new Array(outputSize);

    for (let i = 0; i < outputSize; i++) {
      const rightIdx = matchedRows[i].rightIdx;
      if (rightIdx !== null) {
        newArray[i] = right[col][rightIdx];
      } else {
        newArray[i] = isTypedArray ? NaN : null;
      }
    }

    result[col] = newArray;
  }

  result[SIZE_SYM] = outputSize;
  return result;
}

/**
 * @param {Frame[]} frames
 * @param {string[]} onKeys
 * @returns {Frame}
 */
export function innerJoins(frames, onKeys) {
  if (frames.length === 0) {
    return { size: 0, df: {} };
  }

  if (frames.length === 1) {
    return {
      size: frames[0][Object.keys(frames[0])[0]].length,
      df: frames[0]
    };
  }

  // Sequential join: join first two frames, then join result with third, etc.
  let result = innerJoin(frames[0], frames[1], onKeys);

  for (let i = 2; i < frames.length; i++) {
    result = innerJoin(result, frames[i], onKeys);
  }

  return result;
}

/**
 * @param {Frame[]} frames
 * @param {string[]} onKeys
 * @returns {Frame}
 */
export function outerJoins(frames, onKeys) {
  if (frames.length < 2) throw new Error();
  let result = outerJoin(frames[0], frames[1], onKeys);
  for (let i = 2; i < frames.length; i++) {
    result = outerJoin(result, frames[i], onKeys);
  }
  return result;
}

/**
 * Finds duplicate rows based on specified columns.
 *
 * @param {Frame} frame
 * @param {string[]} columns - Columns to check for duplicates
 * @returns {{ duplicateIndices: number[], keyGroups: Map<string, number[]> }}
 */
export function findDuplicates(frame, columns) {
  const numRows = frame[columns[0]].length;
  const keyGroups = new Map();

  // Build index of all rows by key
  for (let i = 0; i < numRows; i++) {
    const key = columns.map(col => frame[col][i]).join('|');
    if (!keyGroups.has(key)) {
      keyGroups.set(key, []);
    }
    keyGroups.get(key).push(i);
  }

  // Find which keys have duplicates (appear more than once)
  const duplicateIndices = [];
  const duplicateKeys = new Map();

  for (const [key, indices] of keyGroups.entries()) {
    if (indices.length > 1) {
      duplicateKeys.set(key, indices);
      duplicateIndices.push(...indices);
    }
  }

  return {
    duplicateIndices,
    keyGroups: duplicateKeys,
  };
}

/**
 * @param {Frame} frame
 * @param {number} index
 * @returns {Record<string, number | string>}
 */
export function record(frame, index) {
  const result = {};
  for (const [col, values] of Object.entries(frame)) {
    result[col] = values[index];
  }
  return result;
}

/**
 * @param {Frame} frame
 * @param {Predicate[]} predicates
 * @returns {Record<string, number | string> | null}
 */
export function find(frame, predicates) {
  const index = findIndex(frame, predicates);
  return index != null ? record(frame, index) : null;
}

/**
 * @param {Frame} frame
 * @param {Predicate[]} predicates
 * @param {string} key
 * @returns {number | string | null}
 */
export function findKey(frame, predicates, key) {
  const index = findIndex(frame, predicates);
  return index != null ? frame[key][index] : null;
}


/**
 * @param {Frame} frame
 * @param {Predicate[]} predicates
 * @returns {number}
 */
export function findIndex(frame, predicates) {
  const numRows = getSize(frame);

  for (let i = 0; i < numRows; i++) {
    let allMatch = true;

    for (const [colname, predicate] of predicates) {
      if (!predicate(frame[colname][i])) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      return i;
    }
  }

  return null;
}


