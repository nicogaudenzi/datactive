import {BarChart} from '../../src/visualizations/bar-chart.js';
import {LineChart} from '../../src/visualizations/line-chart.js';
import {FilterStore} from '../../src/state/filter-store.js';
import {applyChartInteraction} from '../../src/interactions/chart-interaction-contract.js';

const rows = [
  {country:'US', month:'Jan', revenue:10, cost:4},
  {country:'US', month:'Feb', revenue:20, cost:9},
  {country:'MX', month:'Jan', revenue:30, cost:14},
  {country:'CA', month:'Mar', revenue:40, cost:20},
  {country:'CA', month:'Feb', revenue:50, cost:24},
  {country:'UK', month:'Mar', revenue:60, cost:28}
];
const filterStore = new FilterStore();
const events = [];
const filteredRows = () => rows.filter(row => filterStore.getFilters().every(filter => {
  const value = row[filter.column];
  if (filter.operator === 'equals') return String(value) === String(filter.value);
  if (filter.operator === 'in') return filter.value.includes(value);
  if (filter.operator === 'range') return Number(value) >= filter.value[0] && Number(value) <= filter.value[1];
  return true;
}));
const sumBy = (sourceRows, dimension) => {
  const sums = new Map();
  for (const row of sourceRows) sums.set(row[dimension], (sums.get(row[dimension]) ?? 0) + row.revenue);
  return [...sums].map(([key, revenue]) => ({[dimension]:key, revenue}));
};
const sourceChart = new BarChart(document.querySelector('#source-chart'), {
  query:{dimensions:['country'],measures:[{column:'revenue',aggregation:'sum'}]}
}, {onFilter: event => { events.push(event); applyChartInteraction(event, filterStore); }});
const dependentChart = new LineChart(document.querySelector('#dependent-chart'), {
  query:{dimensions:['month'],measures:[{column:'revenue',aggregation:'sum'}]}
}, {onFilter: event => { events.push(event); applyChartInteraction(event, filterStore); }});
const renderAll = () => {
  const currentRows = filteredRows();
  sourceChart.renderData(sumBy(currentRows, 'country'));
  dependentChart.renderData(sumBy(currentRows, 'month'));
  window.__renderedDependentData = dependentChart.data;
};
filterStore.subscribe(renderAll);
renderAll();
window.__crossChartReady = true;
window.__crossChartEvents = events;
window.__crossChartFilters = () => filterStore.getFilters();
window.__clearCrossChartFilters = () => filterStore.clear();
window.__sourceChart = sourceChart;
window.__dependentChart = dependentChart;
