import test from 'node:test';
import assert from 'node:assert/strict';
import {DATACTIVE_DB_NAME, DATACTIVE_DB_VERSION, DATACTIVE_STORE, estimatePersistentStorage, requestPersistentStorage, openDatactiveDatabase, resetDatabaseConnectionForTests} from '../src/storage/indexeddb.js';

test('IndexedDB storage contract uses a versioned database and a keyed record store', () => {
  assert.equal(DATACTIVE_DB_NAME, 'datactive-storage');
  assert.equal(DATACTIVE_DB_VERSION, 1);
  assert.equal(DATACTIVE_STORE, 'records');
});

test('storage APIs fail clearly when IndexedDB is unavailable', async () => {
  resetDatabaseConnectionForTests();
  await assert.rejects(openDatactiveDatabase(null), /IndexedDB is unavailable/);
  resetDatabaseConnectionForTests();
});

test('storage estimate and persistence request degrade safely when unsupported', async () => {
  assert.equal(await estimatePersistentStorage(), null);
  assert.equal(await requestPersistentStorage(), false);
});
