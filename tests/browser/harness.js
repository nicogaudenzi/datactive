import {CHART_INTERACTION_REGISTRY} from '../../src/interactions/chart-interaction-registry.js';
import {FilterStore} from '../../src/state/filter-store.js';
import {applyChartInteraction} from '../../src/interactions/chart-interaction-contract.js';
import {BarChart} from '../../src/visualizations/bar-chart.js';
import {LineChart} from '../../src/visualizations/line-chart.js';
import {AreaChart} from '../../src/visualizations/area-chart.js';
import {ScatterChart} from '../../src/visualizations/scatter-chart.js';
import {TableChart} from '../../src/visualizations/table-chart.js';
import {PieChart} from '../../src/visualizations/pie-chart.js';
import {HistogramChart} from '../../src/visualizations/histogram-chart.js';
import {DensityChart} from '../../src/visualizations/density-chart.js';
import {StackedBarChart} from '../../src/visualizations/stacked-bar-chart.js';
import {BoxPlotChart} from '../../src/visualizations/box-plot-chart.js';
import {ViolinPlotChart} from '../../src/visualizations/violin-plot-chart.js';
import {HeatmapChart} from '../../src/visualizations/heatmap-chart.js';
import {TreemapChart} from '../../src/visualizations/treemap-chart.js';
import {ComboChart} from '../../src/visualizations/combo-chart.js';
import {WaterfallChart} from '../../src/visualizations/waterfall-chart.js';
import {FunnelChart} from '../../src/visualizations/funnel-chart.js';
import {RadarChart} from '../../src/visualizations/radar-chart.js';
import {MapChart} from '../../src/visualizations/map-chart.js';

const rows = [
  {country:'US', month:'Jan', revenue:10, cost:4},
  {country:'US', month:'Feb', revenue:20, cost:9},
  {country:'MX', month:'Jan', revenue:30, cost:14},
  {country:'CA', month:'Mar', revenue:40, cost:20},
  {country:'CA', month:'Feb', revenue:50, cost:24},
  {country:'UK', month:'Mar', revenue:60, cost:28}
];
const stats = rows.slice(0, 4).map((r, i) => ({
  country:r.country, stats:{lowerWhisker:r.revenue-5,q1:r.revenue-2,median:r.revenue,q3:r.revenue+2,upperWhisker:r.revenue+5,outliers: i === 0 ? [r.revenue-9] : []}
}));
const histogram = {column:'revenue',domain:[10,60],bins:[
  {x0:10,x1:20,count:1},{x0:20,x1:30,count:1},{x0:30,x1:40,count:1},
  {x0:40,x1:50,count:1},{x0:50,x1:60,count:2}
]};
window.__events = [];
window.__registry = CHART_INTERACTION_REGISTRY;
window.__filterStore = new FilterStore();
window.__applyInteraction = payload => applyChartInteraction(payload, window.__filterStore);
window.__activeFilters = () => window.__filterStore.getFilters();
window.__chartClasses = {ScatterChart, StackedBarChart};
window.__fixtureRows = rows;
const onFilter = payload => window.__events.push(payload);
const type = new URLSearchParams(location.search).get('type') || 'bar';
const container = document.querySelector('#chart');
const configs = {
  bar: [BarChart, {query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'}]},data:rows}],
  line: [LineChart, {query:{dimensions:['month'],measures:[{column:'revenue',aggregation:'sum'}]},data:rows}],
  area: [AreaChart, {query:{dimensions:['month'],measures:[{column:'revenue',aggregation:'sum'}]},data:rows}],
  scatter: [ScatterChart, {query:{xColumn:'revenue',yColumn:'cost'},data:rows}],
  table: [TableChart, {query:{columns:['country','month','revenue']},data:rows}],
  pie: [PieChart, {query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'}]},data:[{country:'US',revenue:30},{country:'MX',revenue:30},{country:'CA',revenue:90}]}],
  histogram: [HistogramChart, {query:{histogramColumn:'revenue'},data:histogram}],
  density: [DensityChart, {query:{densityColumn:'revenue'},data:rows}],
  stackedBar: [StackedBarChart, {query:{dimensions:['month','country'],measures:[{column:'revenue',aggregation:'sum'}]},data:rows}],
  boxPlot: [BoxPlotChart, {query:{boxPlotDimension:'country',boxPlotMeasure:'stats'},data:stats}],
  violinPlot: [ViolinPlotChart, {query:{violinPlotDimension:'country',violinPlotMeasure:'revenue'},data:rows}],
  heatmap: [HeatmapChart, {query:{dimensions:['country','month'],measures:[{column:'revenue',aggregation:'sum'}]},data:[
    {country:'US',month:'Jan',revenue:10},{country:'US',month:'Feb',revenue:20},
    {country:'MX',month:'Jan',revenue:30},{country:'MX',month:'Feb',revenue:40}
  ]}],
  treemap: [TreemapChart, {query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'}]},data:[{country:'US',revenue:30},{country:'MX',revenue:30},{country:'CA',revenue:90}]}],
  combo: [ComboChart, {query:{dimensions:['month'],series:[{measure:'revenue',style:'bar'},{measure:'cost',style:'line'}]},data:rows}],
  waterfall: [WaterfallChart, {query:{dimensions:['month'],measures:[{column:'revenue',aggregation:'sum'}]},data:rows}],
  funnel: [FunnelChart, {query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'}]},data:[{country:'US',revenue:30},{country:'MX',revenue:30},{country:'CA',revenue:90}]}],
  radar: [RadarChart, {query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'},{column:'cost',aggregation:'sum'}]},data:[{country:'US',revenue:30,cost:13},{country:'MX',revenue:30,cost:14},{country:'CA',revenue:90,cost:44}]}],
  map: [MapChart, {query:{geographicColumn:'country',measureColumn:'revenue',aggregation:'sum',mapId:'north-america-countries'},data:rows, geographyConfiguration:{version:1,mappings:[{mapId:'north-america-countries',column:'country',values:[
    {sourceValue:'US',regionId:'country-united-states'},
    {sourceValue:'MX',regionId:'country-mexico'},
    {sourceValue:'CA',regionId:'country-canada'}
  ]}]}}]
};
const config = configs[type];
if (!config) throw new Error(`No browser harness config for chart type: ${type}`);
const [Chart, visualization] = config;
const {geographyConfiguration, ...chartVisualization} = visualization;
const chart = new Chart(container, {type, ...chartVisualization}, {onFilter, geographyConfiguration});
chart.renderData(visualization.data);
window.__chart = chart;
window.__chartReady = true;
