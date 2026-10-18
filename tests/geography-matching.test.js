import test from 'node:test';
import assert from 'node:assert/strict';
import {matchGeographicValue, normalizeGeographicLabel, suggestGeographicMappings} from '../src/maps/geography-matching.js';

const map = {
  version: 1,
  id: 'test-map',
  name: 'Test map',
  regionType: 'country',
  regions: [
    {id: 'r-one', name: 'United States', aliases: ['USA', 'U.S.']},
    {id: 'r-two', name: 'Mexico', aliases: ['MX']},
    {id: 'r-three', name: 'Côte d’Ivoire', aliases: ['Ivory Coast', 'CI']}
  ]
};

test('normalizes case, accents, punctuation, apostrophes and whitespace', () => {
  assert.equal(normalizeGeographicLabel('  COTE d’IVOIRE  '), 'cote d ivoire');
  assert.equal(normalizeGeographicLabel('U.S.'), 'u s');
});

test('matches region names and aliases using conservative normalized exact matching', () => {
  assert.equal(matchGeographicValue('  UNITED STATES ', map).regionId, 'r-one');
  assert.equal(matchGeographicValue('u.s.', map).matchType, 'alias');
  assert.equal(matchGeographicValue('Cote d Ivoire', map).regionId, 'r-three');
  assert.equal(matchGeographicValue('United', map).status, 'unmatched');
});

test('reports ambiguity rather than selecting between colliding aliases', () => {
  const ambiguousMap = {...map, regions: [
    {id: 'one', name: 'Region One', aliases: ['CA']},
    {id: 'two', name: 'Region Two', aliases: ['ca']}
  ]};
  const result = matchGeographicValue(' Ca ', ambiguousMap);
  assert.equal(result.status, 'ambiguous');
  assert.deepEqual(result.candidates.map(candidate => candidate.regionId), ['one', 'two']);
  assert.equal(result.regionId, null);
});

test('blank values are reported separately from unmatched values', () => {
  assert.equal(matchGeographicValue(null, map).status, 'blank');
  assert.equal(matchGeographicValue('   ', map).status, 'blank');
});

test('existing user assignments take precedence over suggestions', () => {
  const mapping = {mapId: 'test-map', column: 'Country', values: [{sourceValue: 'USA', regionId: 'r-two'}]};
  const report = suggestGeographicMappings(['USA', 'Mexico', 'Unknown'], mapping, map);
  assert.deepEqual(report.map(item => [item.sourceValue, item.status, item.regionId]), [
    ['USA', 'mapped', 'r-two'],
    ['Mexico', 'matched', 'r-two'],
    ['Unknown', 'unmatched', null]
  ]);
});

test('M6 matches subdivision postal and ISO codes only in the selected map context', async () => {
  const {getBuiltInMap} = await import('../src/maps/builtin-maps.js');
  const {matchGeographicValue: match} = await import('../src/maps/geography-matching.js');
  assert.equal(match('US-CA', getBuiltInMap('us-states')).regionId, 'us-ca');
  assert.equal(match('CA', getBuiltInMap('us-states')).regionId, 'us-ca');
  assert.equal(match('MX-OAX', getBuiltInMap('mexico-states')).regionId, 'mx-oax');
  assert.equal(match('CA-ON', getBuiltInMap('canada-provinces')).regionId, 'ca-on');
  assert.equal(match('US-CA', getBuiltInMap('mexico-states')).status, 'unmatched');
});
