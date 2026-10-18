import test from 'node:test';
import assert from 'node:assert/strict';

function makeFile(text, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text);
  return {
    size: bytes.byteLength,
    stream() {
      let offset = 0;
      return {getReader: () => ({read: async () => {
        if (offset >= bytes.length) return {done: true};
        const value = bytes.slice(offset, offset + chunkSize);
        offset += value.length;
        return {done: false, value};
      }})};
    }
  };
}

test('CSV worker streams quoted fields across chunk boundaries and emits bounded batches', async () => {
  const messages = [];
  globalThis.self = {postMessage: message => messages.push(message)};
  await import('../src/data/csv-worker.js?test-streaming');
  const csv = '\uFEFFName,Value,Note\r\nAlice,001,"hello, world"\r\nBob,002,"multi\nline"\r\n"Escaped ""quote""",003,end\r\n';
  await globalThis.self.onmessage({data: {file: makeFile(csv), reference: 'test.csv', batchSize: 2}});

  assert.deepEqual(messages.find(message => message.type === 'header')?.columns, ['Name', 'Value', 'Note']);
  assert.deepEqual(messages.filter(message => message.type === 'batch').flatMap(message => message.rows), [
    {Name: 'Alice', Value: '001', Note: 'hello, world'},
    {Name: 'Bob', Value: '002', Note: 'multi\nline'},
    {Name: 'Escaped "quote"', Value: '003', Note: 'end'}
  ]);
  assert.ok(messages.filter(message => message.type === 'batch').every(message => message.rows.length <= 2));
  assert.equal(messages.at(-1).type, 'done');
  assert.equal(messages.at(-1).rowsParsed, 3);
});

test('CSV worker reports unmatched quoted fields as an import error', async () => {
  const messages = [];
  globalThis.self.postMessage = message => messages.push(message);
  await globalThis.self.onmessage({data: {file: makeFile('A,B\n1,"unfinished'), reference: 'bad.csv'}});
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /quoted field/);
});
