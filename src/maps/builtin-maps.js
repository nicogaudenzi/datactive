import {validateMapDefinition} from './map-data-contract.js';
import usGeometry from './geometry/us-states.json' with {type: 'json'};
import mexicoGeometry from './geometry/mexico-states.json' with {type: 'json'};
import canadaGeometry from './geometry/canada-provinces.json' with {type: 'json'};

const US_REGIONS = usGeometry.features.map(f => ({id: f.properties.regionId, name: f.properties.name, aliases: f.properties.aliases}));
const MEXICO_REGIONS = mexicoGeometry.features.map(f => ({id: f.properties.regionId, name: f.properties.name, aliases: f.properties.aliases}));
const CANADA_REGIONS = canadaGeometry.features.map(f => ({id: f.properties.regionId, name: f.properties.name, aliases: f.properties.aliases}));

/** First built-in map catalog entry for the M1 manual-mapping workflow. */
export const BUILT_IN_MAPS = Object.freeze([
  validateMapDefinition({
    version: 1,
    id: 'north-america-countries',
    name: 'North America — countries',
    regionType: 'country',
    regions: [
      {id: 'country-canada', name: 'Canada', aliases: ['CA', 'CAN']},
      {id: 'country-mexico', name: 'Mexico', aliases: ['MX', 'MEX']},
      {id: 'country-united-states', name: 'United States', aliases: ['US', 'USA', 'United States of America']}
    ]
  }),
  ...[
    {id: 'us-states', name: 'United States — states', regionType: 'state-province', prefix: 'us', country: 'USA'},
    {id: 'mexico-states', name: 'Mexico — states', regionType: 'state-province', prefix: 'mx', country: 'MEX'},
    {id: 'canada-provinces', name: 'Canada — provinces and territories', regionType: 'state-province', prefix: 'ca', country: 'CAN'}
  ].map(({id, name, regionType, prefix, country}) => {
    // Geometry is generated from the bundled Natural Earth Admin 1 dataset; the
    // catalog's stable IDs are derived from ISO 3166-2 codes.
    const regions = {
      'us-states': US_REGIONS, 'mexico-states': MEXICO_REGIONS, 'canada-provinces': CANADA_REGIONS
    }[id];
    return validateMapDefinition({version: 1, id, name, regionType, regions});
  })
]);

export function getBuiltInMap(mapId) {
  return BUILT_IN_MAPS.find(map => map.id === mapId) ?? null;
}
