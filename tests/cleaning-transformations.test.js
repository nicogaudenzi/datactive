import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTransformationDefinition, replayTransformationDefinitions, validateTransformationDefinitions} from '../src/data/preparation/transform-registry.js';
import {DataPreparationPipeline} from '../src/data/preparation/pipeline.js';

const raw = () => ({columns: ['Country', 'Value'], rows: [
  {Country: ' Mexico ', Value: '10'},
  {Country: 'MEXICO', Value: ''},
  {Country: 'Canada', Value: '20'},
  {Country: 'Canada', Value: '20'}
]});

test('trim-text trims string cells without mutating raw input', () => {
  const input = raw(); const snapshot = structuredClone(input);
  const output = applyTransformationDefinition(input, {id: 'trim', type: 'trim-text', column: 'Country'});
  assert.equal(output.rows[0].Country, 'Mexico');
  assert.equal(input.rows[0].Country, ' Mexico ');
  assert.deepEqual(input, snapshot);
});

test('normalize-case and replace-value are explicit and replayable', () => {
  const definitions = [
    {id: 'lower', type: 'normalize-case', column: 'Country', mode: 'lower'},
    {id: 'map', type: 'replace-value', column: 'Country', find: ' mexico ', replaceWith: 'Mexico'}
  ];
  const result = replayTransformationDefinitions(raw(), definitions).table;
  assert.equal(result.rows[0].Country, 'Mexico');
  assert.equal(result.rows[1].Country, 'MEXICO'.toLowerCase());
});

test('fill-missing replaces blank and whitespace-only values but preserves populated values', () => {
  const result = applyTransformationDefinition(raw(), {id: 'fill', type: 'fill-missing', column: 'Value', value: 'Unknown'});
  assert.deepEqual(result.rows.map(row => row.Value), ['10', 'Unknown', '20', '20']);
});

test('remove-rows-missing drops rows with blank selected values', () => {
  const result = applyTransformationDefinition(raw(), {id: 'remove-missing', type: 'remove-rows-missing', column: 'Value'});
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.some(row => row.Value === ''), false);
});

test('remove-duplicate-rows preserves the first exact row and can use selected key columns', () => {
  const result = applyTransformationDefinition(raw(), {id: 'dedupe', type: 'remove-duplicate-rows'});
  assert.equal(result.rows.length, 3);
  const byCountry = applyTransformationDefinition(raw(), {id: 'dedupe-country', type: 'remove-duplicate-rows', columns: ['Country']});
  assert.equal(byCountry.rows.length, 3);
});

test('pipeline records cleaning provenance and rebuilds from raw when steps are removed', async () => {
  const input = raw(); const snapshot = structuredClone(input);
  const definitions = [
    {id: 'trim-country', type: 'trim-text', column: 'Country'},
    {id: 'fill-value', type: 'fill-missing', column: 'Value', value: 'Unknown'}
  ];
  const cleaned = await new DataPreparationPipeline({definitions}).run(input);
  const original = await new DataPreparationPipeline().run(input);
  assert.equal(cleaned.rows[0].Country, 'Mexico');
  assert.equal(cleaned.rows[1].Value, 'Unknown');
  assert.equal(cleaned.preparation.transformations.length, 2);
  assert.deepEqual(original.rows[0], input.rows[0]);
  assert.deepEqual(input, snapshot);
});

test('cleaning definitions reject missing columns and invalid case modes', () => {
  assert.throws(() => validateTransformationDefinitions([{id: 'bad', type: 'trim-text', column: 'Missing'}], ['Country']), /missing column/);
  assert.throws(() => validateTransformationDefinitions([{id: 'bad', type: 'normalize-case', column: 'Country', mode: 'title'}], ['Country']), /mode must be lower or upper/);
});

test('convert-to-date normalizes valid dates and replaces invalid values with missing values', () => {
  const input = {columns: ['Order Date'], rows: [
    {'Order Date': '2024-02-29'},
    {'Order Date': '2024-03-15T12:30:00Z'},
    {'Order Date': 'not a date'},
    {'Order Date': ''}
  ]};
  const result = applyTransformationDefinition(input, {
    id: 'date-convert', type: 'convert-to-date', column: 'Order Date', onInvalid: 'missing'
  });
  assert.deepEqual(result.rows.map(row => row['Order Date']), ['2024-02-29', '2024-03-15', '', '']);
  assert.equal(input.rows[2]['Order Date'], 'not a date');
});

test('convert-to-date can keep invalid values or remove rows containing them', () => {
  const input = {columns: ['Date'], rows: [{'Date': '2024-01-01'}, {'Date': 'not a date'}]};
  const kept = applyTransformationDefinition(input, {id: 'keep-invalid', type: 'convert-to-date', column: 'Date', onInvalid: 'keep'});
  assert.deepEqual(kept.rows.map(row => row.Date), ['2024-01-01', 'not a date']);
  const removed = applyTransformationDefinition(input, {id: 'remove-invalid', type: 'convert-to-date', column: 'Date', onInvalid: 'remove-row'});
  assert.deepEqual(removed.rows, [{'Date': '2024-01-01'}]);
});

test('convert-to-date rejects unknown invalid-value strategies', () => {
  assert.throws(() => validateTransformationDefinitions([
    {id: 'bad-date', type: 'convert-to-date', column: 'Date', onInvalid: 'guess'}
  ], ['Date']), /onInvalid must be/);
});

test('derived columns support arithmetic, safe functions, and replay from raw data', async () => {
  const input = {columns: ['Revenue', 'Cost', 'Order Date', 'Region'], rows: [
    {Revenue: '120.5', Cost: '80', 'Order Date': '2024-02-14', Region: ' West '},
    {Revenue: 'not reported', Cost: '10', 'Order Date': 'not a date', Region: 'South'}
  ]};
  const definitions = [
    {id: 'profit', type: 'derive-column', targetColumn: 'Profit', expression: '[Revenue] - [Cost]', resultType: 'number'},
    {id: 'month', type: 'derive-column', targetColumn: 'Month', expression: 'FORMAT_MONTH([Order Date])', resultType: 'text'},
    {id: 'region', type: 'derive-column', targetColumn: 'Region Clean', expression: 'UPPER(TRIM([Region]))', resultType: 'text'}
  ];
  const result = await new DataPreparationPipeline({definitions}).run(input);
  assert.equal(result.rows[0].Profit, 40.5);
  assert.equal(result.rows[1].Profit, '');
  assert.equal(result.rows[0].Month, '2024-02');
  assert.equal(result.rows[1].Month, '');
  assert.equal(result.rows[0]['Region Clean'], 'WEST');
  assert.deepEqual(result.columns.slice(-3), ['Profit', 'Month', 'Region Clean']);
  assert.equal(input.columns.includes('Profit'), false);
  assert.equal(result.preparation.transformations[0].parameters.expression, '[Revenue] - [Cost]');
});

test('derived-column definitions validate expressions and allow later steps to reference earlier derived columns', () => {
  const defs = [
    {id:'profit',type:'derive-column',targetColumn:'Profit',expression:'[Revenue] - [Cost]',resultType:'number'},
    {id:'margin',type:'derive-column',targetColumn:'Margin',expression:'[Profit] / [Revenue] * 100',resultType:'number'}
  ];
  assert.equal(validateTransformationDefinitions(defs, ['Revenue','Cost']).length, 2);
  assert.throws(() => validateTransformationDefinitions([{id:'bad',type:'derive-column',targetColumn:'X',expression:'window.alert(1)',resultType:'text'}], ['Revenue']), /Unsupported character|Unknown identifier/);
  assert.throws(() => validateTransformationDefinitions([{id:'bad',type:'derive-column',targetColumn:'X',expression:'[Missing] + 1',resultType:'number'}], ['Revenue']), /missing column/);
});

test('derived expressions support comparisons, IF, logical operators, nesting, and IS_MISSING', () => {
  const input = {columns: ['Revenue', 'Region'], rows: [
    {Revenue: '250', Region: 'North'},
    {Revenue: '120', Region: 'South'},
    {Revenue: 'not reported', Region: 'North'},
    {Revenue: '', Region: 'West'}
  ]};
  const definitions = [
    {id: 'tier', type: 'derive-column', targetColumn: 'Tier', expression: 'IF([Revenue] >= 200, "High", IF([Revenue] >= 100, "Medium", "Low"))', resultType: 'text'},
    {id: 'segment', type: 'derive-column', targetColumn: 'Segment', expression: 'IF([Region] == "North" AND [Revenue] > 100, "Priority", "Other")', resultType: 'text'},
    {id: 'safe-tier', type: 'derive-column', targetColumn: 'Safe Tier', expression: 'IF(IS_MISSING([Revenue]), "Unknown", IF([Revenue] > 100, "High", "Low"))', resultType: 'text'},
    {id: 'missing', type: 'derive-column', targetColumn: 'Revenue Missing', expression: 'IS_MISSING([Revenue])', resultType: 'text'},
    {id: 'or-check', type: 'derive-column', targetColumn: 'North Or High', expression: 'IF([Region] == "North" OR [Revenue] >= 200, "Yes", "No")', resultType: 'text'},
    {id: 'not-check', type: 'derive-column', targetColumn: 'Not North', expression: 'IF(NOT ([Region] == "North"), "Yes", "No")', resultType: 'text'},
    {id: 'less-check', type: 'derive-column', targetColumn: 'At Most 120', expression: 'IF([Revenue] <= 120, "Yes", "No")', resultType: 'text'}
  ];
  const result = replayTransformationDefinitions(input, definitions).table;
  assert.deepEqual(result.rows.map(row => row.Tier), ['High', 'Medium', '', '']);
  assert.deepEqual(result.rows.map(row => row.Segment), ['Priority', 'Other', '', 'Other']);
  assert.deepEqual(result.rows.map(row => row['Safe Tier']), ['High', 'High', '', 'Unknown']);
  assert.deepEqual(result.rows.map(row => row['Revenue Missing']), ['false', 'false', 'false', 'true']);
  assert.deepEqual(result.rows.map(row => row['North Or High']), ['Yes', 'No', 'Yes', '']);
  assert.deepEqual(result.rows.map(row => row['Not North']), ['No', 'Yes', 'No', 'Yes']);
  assert.deepEqual(result.rows.map(row => row['At Most 120']), ['No', 'Yes', '', '']);
  assert.equal(input.columns.includes('Tier'), false);
});

test('conditional expressions validate function arity and reject unsupported syntax', () => {
  assert.throws(() => validateTransformationDefinitions([
    {id: 'bad-if', type: 'derive-column', targetColumn: 'X', expression: 'IF([Value] > 1, "yes")', resultType: 'text'}
  ], ['Value']), /invalid number of arguments/);
  assert.throws(() => validateTransformationDefinitions([
    {id: 'bad-missing', type: 'derive-column', targetColumn: 'X', expression: 'IS_MISSING()', resultType: 'text'}
  ], ['Value']), /invalid number of arguments/);
  assert.throws(() => validateTransformationDefinitions([
    {id: 'bad-col', type: 'derive-column', targetColumn: 'X', expression: 'IF([Unknown] > 1, "yes", "no")', resultType: 'text'}
  ], ['Value']), /missing column/);
});
