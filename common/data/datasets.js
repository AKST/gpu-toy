export const ituCellPhones = {
  url: '../files/mobile-cellular-subscriptions.csv',
  seriesCode: 'i271',
  dataName: 'phoneUsage',
  headers: [
    { name: 'seriesID', type: 'string', drop: true },
    // need to filter by 'i271'
    { name: 'seriesCode', type: 'string' },
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

export const ituMobileBoardBandSubcriptions = {
  url: '../files/active-mobile-broadband-subscriptions_1762956324397.csv',
  seriesCode: 'i271mw',
  dataName: 'phoneInternet',
  headers: [
    { name: 'seriesID', type: 'string', drop: true },
    // need to filter by 'i271'
    { name: 'seriesCode', type: 'string' },
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

const generateYears = (a, b) =>
  Array.from({ length: b - a }, (_, i) => ({ name: `${a+i}`, type: 'number' }))

const wbYears = generateYears(1960, 2025);
const pwtKpppYears = generateYears(1950, 2024);
const pwtCtfpYears = generateYears(1954, 2024);

const wbColumns = [
  { name: 'Country Name', type: 'string', drop: true },
  { name: 'Country Code', type: 'string', rename: 'countryIso' },
  { name: 'Indicator Name', type: 'string', drop: true },
  { name: 'Indicator Code', type: 'string', drop: true },
  ...wbYears,
];

export const wbPopulation = {
  // in thousands
  source: 'https://data.worldbank.org/indicator/SP.POP.TOTL',
  url: '../files/API_SP.POP.TOTL_DS2_en_csv_v2_130083.csv',
  dropRows: 4,
  headers: {
    load: wbColumns,
    long: {
      retain: ['countryIso'],
      colout: { val: 'population', key: 'year' },
    },
  },
};

export const wbLabourForce = {
  // data sourced in 1000's
  source: 'https://data.worldbank.org/indicator/SL.TLF.TOTL.IN',
  url: '../files/API_SL.TLF.TOTL.IN_DS2_en_csv_v2_127995.csv',
  dropRows: 4,
  headers: {
    load: wbColumns,
    long: {
      retain: ['countryIso'],
      colout: { val: 'labourForce', key: 'year' },
    },
  },
};

export const wbUnemployment = {
  source: 'https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS',
  url: '../files/API_SL.UEM.TOTL.ZS_DS2_en_csv_v2_130165.csv',
  dropRows: 4,
  headers: {
    load: wbColumns,
    long: {
      retain: ['countryIso'],
      colout: { val: 'unemployment', key: 'year' },
    },
  },
};

export const wbSavingsRateOfGDP = {
  avg2000: 0.25,
  source: 'https://data.worldbank.org/indicator/NY.GNS.ICTR.ZS',
  url: '../files/API_NY.GNS.ICTR.ZS_DS2_en_csv_v2_156757.csv',
  dropRows: 4,
  headers: {
    load: wbColumns,
    long: {
      retain: ['countryIso'],
      colout: { val: 'gross_savings_pct', key: 'year' },
    },
  },
};

export const pwtCapitalStock = {
  source: 'https://pwt-data-tool.streamlit.app/?page=Thematic+select',
  url: '../files/2025-11-12T08-48_export.csv',
  headers: {
    load: [
      { type: 'string', name: 'ISO code', rename: 'countryIso' },
      { drop: true, type: 'string', name: 'Country' },
      { drop: true, type: 'string', name: 'Variable code' },
      { drop: true, type: 'string', name: 'Variable name' },
      ...pwtKpppYears,
    ],
    long: {
      retain: ['countryIso'],
      colout: { val: 'capitalPPP', key: 'year' },
    },
  },
};

export const pwtTfpStock = {
  avg1999: 0.636244538850831,
  source: 'https://www.rug.nl/ggdc/productivity/pwt/',
  url: '../files/2025-11-15T05-12_export.csv',
  headers: {
    load: [
      { type: 'string', name: 'ISO code', rename: 'countryIso' },
      { drop: true, type: 'string', name: 'Country' },
      { drop: true, type: 'string', name: 'Variable code' },
      { drop: true, type: 'string', name: 'Variable name' },
      ...pwtCtfpYears,
    ],
    long: {
      retain: ['countryIso'],
      colout: { val: 'ctfp', key: 'year' },
    },
  },
};

export const pwtAvgDepreciation = {
  avg2000: 0.043634836264368,
  source: 'https://www.rug.nl/ggdc/productivity/pwt/',
  url: '../files/2025-11-15T08-50_export.csv',
  headers: {
    load: [
      { type: 'string', name: 'ISO code', rename: 'countryIso' },
      { drop: true, type: 'string', name: 'Country' },
      { drop: true, type: 'string', name: 'Variable code' },
      { drop: true, type: 'string', name: 'Variable name' },
      ...pwtCtfpYears,
    ],
    long: {
      retain: ['countryIso'],
      colout: { val: 'avgDepreciation', key: 'year' },
    },
  },
};

export const pwtLabourShare = {
  avg2000: 0.043634836264368,
  source: 'https://www.rug.nl/ggdc/productivity/pwt/',
  url: '../files/2025-11-15T09-02_export.csv',
  headers: {
    load: [
      { type: 'string', name: 'ISO code', rename: 'countryIso' },
      { drop: true, type: 'string', name: 'Country' },
      { drop: true, type: 'string', name: 'Variable code' },
      { drop: true, type: 'string', name: 'Variable name' },
      ...pwtCtfpYears,
    ],
    long: {
      retain: ['countryIso'],
      colout: { val: 'labours_share', key: 'year' },
    },
  },
};
