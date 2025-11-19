import * as csv from '@common/data/csv.js';
import * as datasets from '@common/data/datasets.js';

export async function showHtmlLayout() {
  const parser = new DOMParser();
  const response = await fetch('./content.html');
  const html = await response.text();
  const doc = parser.parseFromString(html, 'text/html');
  const template = doc.querySelector('#model-syntax');
  document.body.insertBefore(
    template.content.cloneNode(true),
    document.body.firstChild,
  );
}

export async function createShader(device) {
  const shaderResp = await fetch('./compute.wgsl', {
    headers: { Accepts: 'text/plain' }
  });
  const shaderCode = await shaderResp.text();
  return device.createShaderModule({ code: shaderCode });
}


const Fetching = {
  loadWideData(cfg) {
    return fetch(cfg.url)
        .then(r => r.text())
        .then(t => csv.processCsv(t, {
          headers: cfg.headers.load,
          dropRows: cfg.dropRows ?? 0,
        }))
        .then(df => {
          const { retain, colout } = cfg.headers.long;
          return csv.wideToLong(df, retain, colout);
        })
  },

  loadLongData(cfg) {
    return fetch(cfg.url)
        .then(r => r.text())
        .then(t => csv.processCsv(t, {
          headers: cfg.headers,
          dropRows: cfg.dropRows ?? 0,
        }))
  },

  loadItuData(cfg) {
    return Fetching.loadLongData(cfg)
        .then(df => csv.filter(df, 'seriesCode', y => y === cfg.seriesCode))
        .then(df => csv.dropColumn(df, 'seriesCode'))
        .then(df => csv.renameColumn(df, { value: cfg.dataName }))
  },
};

export async function loadInitialData() {
  const [
    ituPhone,
    ituMobileInternet,
    wbPop,
    wbLabourForce,
    wbUnemployment,
    wbSavings,
    pwtStock,
    pwtTfpStock,
    pwtAvgDepreciation,
    pwtLabourShare,
  ] = await Promise.all([
    Fetching.loadItuData(datasets.ituCellPhones),
    Fetching.loadItuData(datasets.ituMobileBoardBandSubcriptions),
    Fetching.loadWideData(datasets.wbPopulation),
    Fetching.loadWideData(datasets.wbLabourForce),
    Fetching.loadWideData(datasets.wbUnemployment),
    Fetching.loadWideData(datasets.wbSavingsRateOfGDP),
    Fetching.loadWideData(datasets.pwtCapitalStock),
    Fetching.loadWideData(datasets.pwtTfpStock),
    Fetching.loadWideData(datasets.pwtAvgDepreciation),
    Fetching.loadWideData(datasets.pwtLabourShare),
  ]);

  return csv.outerJoins(
    [
      ituPhone, ituMobileInternet, wbPop, wbLabourForce,
      wbUnemployment, pwtStock, pwtTfpStock,
      wbSavings, pwtAvgDepreciation, pwtLabourShare,
    ],
    ['countryIso', 'year'],
  )
}

/**
 * Setup data for processing
 * @param {DataFrame} initialData
 */
export function setupData(initData) {
  const columnsThatNeedCleaning = [
    'capitalPPP', 'labourForce', 'mobilePhoneInternetConnections',
    'mobilePhoneSubscription', 'population', 'unemployment', 'ctfp',
  ];
  const columnsWeCanFake = [
    'grossSavingsPct',
    'avgDepreciation',
    'laboursShare',
  ];

  // insert any safe values if there's risk of data being dropped.
  const countryIsos = [
    ...(new Set(initData.countryIso))
  ].sort().filter(iso => iso != null);
  console.log(countryIsos);

  let join = csv.filter(initData, 'year', year => !Number.isNaN(year) && year > 1999);
  let joinGroup = csv.sortAndIdentifyGroups('countryIso', 'year', join);
  join = joinGroup.frame;

  for (const [col, ds] of [
    ['grossSavingsPct', datasets.wbSavingsRateOfGDP],
    ['avgDepreciation', datasets.pwtAvgDepreciation],
    ['laboursShare', datasets.pwtLabourShare],
  ]) {
    for (const country of countryIsos) {
      const index = csv.findIndex(join, [
        ['year', year => year === 2000],
        ['countryIso', iso => iso === country],
      ]);

      if (index == null) continue;
      const value = join[col][index];
      const weird = (value == null || Number.isNaN(value) || value == 0);
      if (weird) {
        join[col][index] = ds.avg2000;
      }
    }
  }

  joinGroup = csv.filterGroups(joinGroup, { uniformSize: true }, meta => {
    if (meta.max < 2012 || meta.count < 10) return false;


    const join = joinGroup.frame;
    const { count, offset } = meta;

    for (const colname of columnsThatNeedCleaning) {
      if (colname === 'ctfp') continue;
      const input = join[colname];
      let nans = 0;
      for (let i = 0; i < count; i++) {
        if (Number.isNaN(input[offset + i])) nans += 1;
      }
      if (nans >= (count - nans)) return false;
    }

    return true;
  });


  joinGroup = csv.sortAndIdentifyGroups('countryIso', 'year', joinGroup.frame);
  join = joinGroup.frame;

  const size = csv.getSize(join);
  join.employed = new Float32Array(size);
  join.out_a_technology = new Float32Array(size);
  join.out_a_capitalSteadyState = new Float32Array(size);
  join.out_a_capital = new Float32Array(size);
  join.out_a_output = new Float32Array(size);
  join.out_b_technology = new Float32Array(size);
  join.out_b_capitalSteadyState = new Float32Array(size);
  join.out_b_capital = new Float32Array(size);
  join.out_b_output = new Float32Array(size);
  join.out_c_capitalSteadyState = new Float32Array(size);
  join.out_c_capital = new Float32Array(size);
  join.out_c_output = new Float32Array(size);

  join.generatedData = new Array(size).fill('');


  /**
   * Clean up the data may not be complete
   */
  for (const colname of [
    ...columnsThatNeedCleaning,
    ...columnsWeCanFake,
  ]) {
    const input = join[colname];
    for (const [groupValue, { offset, count }] of joinGroup.groups.entries()) {
      if (Number.isNaN(input[offset])) {
        input[offset] = 0;
        join.generatedData[offset] += ':'+colname
      }
      for (let i = 1; i < count; i++) {
        let idx = offset + i;
        if (Number.isNaN(input[idx])) {
          join.generatedData[idx] += ':'+colname
          input[idx] = input[idx-1];
          if (Number.isNaN(input[idx])) debugger;
        }
      }
    }
  }

  const initCapital = Array.from(joinGroup.groups.keys(), country => {
    const index = csv.findIndex(initData, [
      ['year', year => year === 1999],
      ['countryIso', iso => iso === country],
    ]);
    return initData.capitalPPP[index];
  });

  const initTFP = Array.from(joinGroup.groups.keys(), country => {
    const index = csv.findIndex(initData, [
      ['year', year => year === 1999],
      ['countryIso', iso => iso === country],
    ]);
    const value = initData.ctfp[index];
    const weird = (value == null || Number.isNaN(value) || value == 0);
    return weird ? (datasets.pwtTfpStock.avg1999 / 2) : value;
  });

  for (let i = 0; i < size; i++) join.grossSavingsPct[i] = join.grossSavingsPct[i] / 100;

  const offsets = Array.from(joinGroup.groups.values(), row => row.offset);

  const initalValues = csv.createDf({
    countryIso: Array.from(joinGroup.groups.keys()),
    capital: new Float32Array(initCapital),
    technology: new Float32Array(initTFP),
    offsets: new Uint32Array(offsets),
  });
  return [size, joinGroup, join, initalValues];
}
