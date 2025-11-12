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
    { name: 'dataValue', type: 'string', rename: 'value' },
    { name: 'dataYear', type: 'number', rename: 'year' },
    { name: 'dataNote', type: 'string', drop: true },
    { name: 'dataSource', type: 'string', drop: true },
    { name: 'seriesDescription', type: 'string', drop: true },
  ],
};
