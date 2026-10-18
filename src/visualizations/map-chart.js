import * as d3 from 'd3';
import {buildMapChartModel} from '../maps/map-chart-model.js';
import northAmericaGeometry from '../maps/geometry/north-america-countries.json';
import usStatesGeometry from '../maps/geometry/us-states.json';
import mexicoStatesGeometry from '../maps/geometry/mexico-states.json';
import canadaProvincesGeometry from '../maps/geometry/canada-provinces.json';
import {getMapGeometry} from '../maps/map-catalog.js';
import {cleanupChartLifecycle, observeChartResize} from './chart-lifecycle.js';

const GEOMETRY_BY_MAP = Object.freeze({
  'north-america-countries': northAmericaGeometry,
  'us-states': usStatesGeometry,
  'mexico-states': mexicoStatesGeometry,
  'canada-provinces': canadaProvincesGeometry
});

export class MapChart {
  constructor(container, visualization, {onFilter, geographyConfiguration} = {}) {
    this.container = container;
    this.visualization = visualization;
    this.onFilter = onFilter;
    this.geographyConfiguration = geographyConfiguration;
    this.root = d3.select(container);
    observeChartResize(this, container);
  }

  renderData(rows) {
    const {geographicColumn, measureColumn, aggregation, mapId} = this.visualization.query;
    const model = buildMapChartModel({rows, geographicColumn, measureColumn, aggregation, mapId, geographyConfiguration: this.geographyConfiguration});
    this.root.selectAll('*').remove();
    const width = Math.max(300, this.container.clientWidth || 600);
    const height = Math.max(230, this.container.clientHeight || 360);
    const svg = this.root.append('svg').attr('class', 'map-chart-svg').attr('width', '100%').attr('height', '100%').attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', `${model.map.name} choropleth map`);
    const headerHeight = 38;
    const footerHeight = 30;
    const geometry = GEOMETRY_BY_MAP[mapId] ?? getMapGeometry(mapId);
    const mapFeatures = new Map((geometry?.features ?? []).map(feature => [feature.properties.regionId, feature]));
    const features = model.map.regions.map(region => mapFeatures.get(region.id)).filter(Boolean);
    const featureCollection = {type: 'FeatureCollection', features};
    // Natural Earth is a north-up world projection, suitable for a multi-country view
    // spanning Canada, the United States, and Mexico. The conic projection previously
    // used here distorted the visual orientation at this regional extent.
    const projection = d3.geoNaturalEarth1();
    projection.fitExtent([[16, headerHeight + 6], [width - 16, height - footerHeight - 8]], featureCollection);
    const path = d3.geoPath(projection);
    const values = model.regions.map(region => region.value).filter(value => value !== null && Number.isFinite(value));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const color = d3.scaleSequential(d3.interpolatePuBu).domain(min === max ? [min - 1, max + 1] : [min, max]);
    const byId = new Map(model.regions.map(region => [region.id, region]));
    const zoomLayer = svg.append('g').attr('class', 'map-zoom-layer');

    svg.append('text').attr('x', 12).attr('y', 20).attr('class', 'map-chart-summary')
      .text(`${model.mappedRegionCount} of ${model.regions.length} regions with data · ${model.unmappedValueCount} unmapped source values`);

    zoomLayer.append('g').attr('class', 'map-regions')
      .selectAll('path.map-region').data(features, feature => feature.properties.regionId).join('path')
      .attr('class', 'map-region')
      .attr('data-region-id', feature => feature.properties.regionId)
      .attr('d', path)
      .attr('fill', feature => {
        const value = byId.get(feature.properties.regionId)?.value;
        return value === null || !Number.isFinite(value) ? '#737d8c' : color(value);
      })
      .attr('stroke', '#ffffff').attr('stroke-width', 0.8).attr('vector-effect', 'non-scaling-stroke')
      .style('cursor', 'pointer')
      .on('click', (_, feature) => {
        const regionId = feature.properties.regionId;
        const sourceValues = (this.geographyConfiguration?.mappings ?? [])
          .find(mapping => mapping.mapId === mapId && mapping.column === geographicColumn)?.values
          ?.filter(entry => entry.regionId === regionId).map(entry => entry.sourceValue) ?? [];
        if (sourceValues.length) this.onFilter?.({column: geographicColumn, operator: 'in', value: sourceValues, toggle: true});
      })
      .append('title').text(feature => {
        const data = byId.get(feature.properties.regionId);
        return `${feature.properties.name}\n${measureColumn}: ${data.value === null ? 'No data' : formatValue(data.value)}\n${data.rowCount} value${data.rowCount === 1 ? '' : 's'} aggregated`;
      });

    const tooltip = this.root.append('div').attr('class', 'map-chart-tooltip').attr('role', 'status').style('position', 'absolute').style('pointer-events', 'none').style('display', 'none');
    this.root.style('position', 'relative');
    svg.selectAll('path.map-region')
      .on('pointerenter', (event, feature) => {
        const data = byId.get(feature.properties.regionId);
        tooltip.style('display', 'block').text(`${feature.properties.name} · ${measureColumn}: ${data.value === null ? 'No data' : formatValue(data.value)} · ${aggregationLabel(aggregation)} · ${data.rowCount} row${data.rowCount === 1 ? '' : 's'}`);
        const bounds = this.container.getBoundingClientRect();
        tooltip.style('left', `${Math.max(4, Math.min(event.offsetX + 12, bounds.width - 220))}px`).style('top', `${Math.max(4, event.offsetY + 12)}px`);
      })
      .on('pointermove', event => {
        const bounds = this.container.getBoundingClientRect();
        tooltip.style('left', `${Math.max(4, Math.min(event.offsetX + 12, bounds.width - 220))}px`).style('top', `${Math.max(4, event.offsetY + 12)}px`);
      })
      .on('pointerleave', () => tooltip.style('display', 'none'));

    const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', event => zoomLayer.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    svg.append('g').attr('class', 'map-zoom-controls').attr('transform', `translate(${width - 28},${headerHeight + 8})`)
      .append('text').attr('role', 'button').attr('tabindex', 0).attr('aria-label', 'Reset map zoom').attr('text-anchor', 'middle').attr('font-size', 18).attr('font-weight', 700).attr('fill', 'currentColor').style('cursor', 'pointer').text('↺')
      .on('click', () => svg.transition().duration(180).call(zoom.transform, d3.zoomIdentity))
      .on('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); svg.transition().duration(180).call(zoom.transform, d3.zoomIdentity); } });

    zoomLayer.append('g').attr('class', 'map-region-labels').selectAll('text')
      .data(features, feature => feature.properties.regionId).join('text')
      .attr('class', 'map-region-label')
      .attr('data-region-id', feature => feature.properties.regionId)
      .attr('x', feature => path.centroid(feature)[0])
      .attr('y', feature => path.centroid(feature)[1])
      .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
      .attr('stroke', '#ffffff').attr('stroke-width', 2.5).attr('stroke-linejoin', 'round').attr('paint-order', 'stroke')
      .attr('font-size', mapId === 'north-america-countries' ? 11 : 8).attr('font-weight', 700).attr('fill', '#172033').style('pointer-events', 'none')
      .text(feature => {
        if (mapId === 'north-america-countries') return feature.properties.name === 'United States' ? 'USA' : feature.properties.name;
        if (mapId.startsWith('custom-')) return feature.properties.name;
        return feature.properties.postal || feature.properties.iso3166_2?.split('-').at(-1) || feature.properties.name;
      });

    const legend = svg.append('g').attr('class', 'map-chart-legend')
      .attr('transform', `translate(${Math.max(12, width - 184)},${height - 24})`);
    const gradientId = `map-color-scale-${String(mapId).replace(/[^a-z0-9-]/gi, '-')}`;
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient').attr('id', gradientId);
    gradient.append('stop').attr('offset', '0%').attr('stop-color', color(min));
    gradient.append('stop').attr('offset', '100%').attr('stop-color', color(max));
    legend.append('rect').attr('width', 82).attr('height', 8).attr('rx', 2).attr('fill', `url(#${gradientId})`);
    legend.append('text').attr('x', 0).attr('y', -4).attr('font-size', 9).attr('fill', 'currentColor').text(formatValue(min));
    legend.append('text').attr('x', 82).attr('y', -4).attr('text-anchor', 'end').attr('font-size', 9).attr('fill', 'currentColor').text(formatValue(max));
    legend.append('rect').attr('x', 94).attr('y', 0).attr('width', 9).attr('height', 9).attr('fill', '#737d8c').attr('stroke', '#596273');
    legend.append('text').attr('x', 107).attr('y', 8).attr('font-size', 9).attr('fill', 'currentColor').text('No data');

    svg.append('text').attr('x', 12).attr('y', height - 10).attr('class', 'map-chart-note')
      .text(model.unmappedValueCount > 0
        ? `Unmapped values (${model.unmappedValueCount}) are excluded: ${model.unmappedValues.slice(0, 5).map(value => String(value)).join(', ')}${model.unmappedValueCount > 5 ? ', …' : ''}. Assign them in Maps.`
        : `${mapId.startsWith('custom-') ? 'Custom GeoJSON boundaries' : `Natural Earth ${mapId === 'north-america-countries' ? 'country' : 'state/province'} boundaries`} · dark gray regions have no valid measure data`);
  }

  destroy() { cleanupChartLifecycle(this); this.root.selectAll('*').remove(); }
}

function aggregationLabel(value) { return ({sum:'Sum', average:'Average', min:'Minimum', max:'Maximum', count:'Count'})[value] ?? value; }

function formatValue(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(value) : String(value ?? '');
}
