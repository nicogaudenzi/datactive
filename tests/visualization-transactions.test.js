import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVisualizationTransaction,
  replaceVisualizationTransaction
} from '../src/dashboard/visualization-transactions.js';

function makeContent() {
  return {
    children: [],
    replaceChildren() { this.children = []; }
  };
}

function makeChart(name, {renderError = null, destroyError = null} = {}) {
  return {
    name,
    destroyed: false,
    destroy() {
      this.destroyed = true;
      if (destroyError) throw destroyError;
    },
    renderData() {
      if (renderError) throw renderError;
    }
  };
}

test('failed initial render destroys partial chart and removes the new widget without registering it', () => {
  const visualization = {id: 'chart-2', type: 'bar'};
  const widget = {content: makeContent()};
  let removed = 0;
  let committed = 0;
  let createdChart;

  assert.throws(() => createVisualizationTransaction({
    visualization,
    createWidget: () => widget,
    getContent: value => value.content,
    createRenderer: () => (createdChart = makeChart('new', {renderError: new Error('render failed')})),
    render: (chart) => chart.renderData(),
    commit: () => { committed += 1; },
    rollbackWidget: value => { assert.equal(value, widget); removed += 1; }
  }), /render failed/);

  assert.equal(createdChart.destroyed, true);
  assert.deepEqual(widget.content.children, []);
  assert.equal(removed, 1);
  assert.equal(committed, 0);
});

test('failed renderer construction removes the newly created widget', () => {
  const widget = {content: makeContent()};
  let removed = 0;

  assert.throws(() => createVisualizationTransaction({
    visualization: {id: 'chart-3'},
    createWidget: () => widget,
    getContent: value => value.content,
    createRenderer: () => { throw new Error('constructor failed'); },
    render: () => {},
    commit: () => assert.fail('must not commit failed renderer'),
    rollbackWidget: () => { removed += 1; }
  }), /constructor failed/);

  assert.equal(removed, 1);
});

test('failed replacement restores the previous visualization and commits the restored renderer', () => {
  const previousVisualization = {id: 'chart-1', type: 'bar'};
  const nextVisualization = {...previousVisualization, type: 'line'};
  const previousChart = makeChart('old');
  const previousEntry = {visualization: previousVisualization, chart: previousChart};
  const content = makeContent();
  let commitValue;
  let constructionCount = 0;

  assert.throws(() => replaceVisualizationTransaction({
    previousEntry,
    nextVisualization,
    content,
    createRenderer: (_content, visualization) => {
      constructionCount += 1;
      if (visualization.type === 'line') throw new Error('replacement constructor failed');
      return makeChart('restored');
    },
    render: chart => chart.renderData(),
    commit: value => { commitValue = value; },
    removeUnrecoverable: () => assert.fail('successful restore must not remove widget')
  }), error => error.message === 'replacement constructor failed' && error.recovered === true);

  assert.equal(previousChart.destroyed, true);
  assert.equal(constructionCount, 2);
  assert.equal(commitValue.visualization, previousVisualization);
  assert.equal(commitValue.chart.name, 'restored');
});

test('failed replacement and failed restoration remove the unusable visualization', () => {
  const previousEntry = {
    visualization: {id: 'chart-1', type: 'bar'},
    chart: makeChart('old')
  };
  const content = makeContent();
  let removed = 0;
  let commits = 0;

  assert.throws(() => replaceVisualizationTransaction({
    previousEntry,
    nextVisualization: {...previousEntry.visualization, type: 'line'},
    content,
    createRenderer: () => { throw new Error('cannot construct either renderer'); },
    render: () => {},
    commit: () => { commits += 1; },
    removeUnrecoverable: () => { removed += 1; }
  }), error => error.message === 'cannot construct either renderer' && error.recovered === false);

  assert.equal(removed, 1);
  assert.equal(commits, 0);
  assert.deepEqual(content.children, []);
});


test('failed replacement render restores the previous renderer and configuration', () => {
  const previousVisualization = {id: 'chart-1', type: 'bar', title: 'Old title'};
  const nextVisualization = {...previousVisualization, title: 'New title', query: {dimensions: ['missing']}};
  const previousChart = makeChart('old');
  const previousEntry = {visualization: previousVisualization, chart: previousChart};
  const content = makeContent();
  let committed;
  let constructionCount = 0;

  assert.throws(() => replaceVisualizationTransaction({
    previousEntry,
    nextVisualization,
    content,
    createRenderer: () => {
      constructionCount += 1;
      return constructionCount === 1
        ? makeChart('replacement', {renderError: new Error('replacement render failed')})
        : makeChart('restored');
    },
    render: chart => chart.renderData(),
    commit: value => { committed = value; },
    removeUnrecoverable: () => assert.fail('successful restoration must keep the widget')
  }), error => error.message === 'replacement render failed' && error.recovered === true);

  assert.equal(constructionCount, 2);
  assert.equal(committed.visualization, previousVisualization);
  assert.equal(committed.visualization.title, 'Old title');
  assert.equal(committed.chart.name, 'restored');
});

test('successful replacement commits the new renderer and configuration', () => {
  const previousEntry = {
    visualization: {id: 'chart-1', type: 'bar'},
    chart: makeChart('old')
  };
  const nextVisualization = {...previousEntry.visualization, type: 'line'};
  const content = makeContent();
  let committed;

  const result = replaceVisualizationTransaction({
    previousEntry,
    nextVisualization,
    content,
    createRenderer: () => makeChart('new'),
    render: chart => chart.renderData(),
    commit: value => { committed = value; },
    removeUnrecoverable: () => assert.fail('successful replacement must not remove widget')
  });

  assert.equal(result.recovered, false);
  assert.equal(committed.visualization, nextVisualization);
  assert.equal(committed.chart.name, 'new');
  assert.equal(previousEntry.chart.destroyed, true);
});

test('failed restoration destroys its partial renderer before removing the widget', () => {
  const previousEntry = {
    visualization: {id: 'chart-1', type: 'bar'},
    chart: makeChart('old')
  };
  const content = makeContent();
  const partiallyRestored = makeChart('partial restore', {renderError: new Error('restore render failed')});
  let constructionCount = 0;
  let removed = 0;

  assert.throws(() => replaceVisualizationTransaction({
    previousEntry,
    nextVisualization: {...previousEntry.visualization, type: 'line'},
    content,
    createRenderer: () => {
      constructionCount += 1;
      if (constructionCount === 1) throw new Error('replacement constructor failed');
      return partiallyRestored;
    },
    render: chart => chart.renderData(),
    commit: () => assert.fail('failed replacement or restore must not commit'),
    removeUnrecoverable: () => { removed += 1; }
  }), error => error.message === 'replacement constructor failed' && error.recovered === false);

  assert.equal(partiallyRestored.destroyed, true);
  assert.equal(removed, 1);
  assert.deepEqual(content.children, []);
});
