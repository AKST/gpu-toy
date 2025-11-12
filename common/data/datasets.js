export const ituCellPhones = {
  url: '../files/mobile-cellular-subscriptions.csv',
  headers: [
    { name: 'seriesID', type: 'string', drop: true },
    { name: 'seriesCode', type: 'string', drop: true },
    { name: 'seriesName', type: 'string', drop: true },
    { name: 'seriesParent', type: 'string', drop: true },
    { name: 'seriesUnits', type: 'string', drop: true },
    { name: 'entityID', type: 'string', rename: 'countryId' },
    { name: 'entityIso', type: 'string', rename: 'countryIso' },
    { name: 'entityName', type: 'string', rename: 'countryName' },
    { name: 'dataValue', type: 'number', rename: 'value' },
    { name: 'dataYear', type: 'number', rename: 'year' },
    { name: 'dataNote', type: 'string', drop: true },
    { name: 'dataSource', type: 'string', drop: true },
    { name: 'seriesDescription', type: 'string', drop: true },
  ],
};

const wbYears = Array.from({ length: 2024 - 1960 }, (_, i) => 1960+i);

export const wbPopulation = {
  url: '../files/API_SP.POP.TOTL_DS2_en_csv_v2_130083.csv',
  dropRows: 4,
  headers: {
    load: [
      { name: 'Country Name', type: 'string', drop: true },
      { name: 'Country Code', type: 'string', rename: 'countryIso' },
      { name: 'Indicator Name', type: 'string', drop: true },
      { name: 'Indicator Code', type: 'string', drop: true },
      ...wbYears.map(year => ({ name: `${year}`, type: 'number' })),
    ],
    long: {
      retain: ['countryIso'],
      columnValue: 'population',
      columnKey: 'year',
    },
  },
};
