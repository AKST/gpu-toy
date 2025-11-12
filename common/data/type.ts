export type RowDefinition = { name: string, type: 'string' | 'number', rename?: 'string', drop?: boolean }
export type Frame = Record<string, string[] | Float64Array>
export type GroupMetadata = { offset: number, count: number }
export type GroupedFrame = {
  frame: Frame,
  groups: Map<string | number, GroupMetadata>,
  groupValues: (string | number)[]
}

