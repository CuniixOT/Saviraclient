const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { detectMode, resolveInstallDir } = require('../electron/setup.cjs');

test('always installs into a dedicated Savira folder', () => {
  assert.equal(resolveInstallDir(String.raw`C:\Games`), path.join(String.raw`C:\Games`, 'Savira'));
  assert.equal(resolveInstallDir(String.raw`C:\Games\Savira`), String.raw`C:\Games\Savira`);
  assert.equal(resolveInstallDir(String.raw`D:\savira`), String.raw`D:\savira`);
  assert.equal(resolveInstallDir('D:\\'), path.join('D:\\', 'Savira'));
  assert.equal(resolveInstallDir(String.raw`C:\Games\Savira\..\Other`), path.join(String.raw`C:\Games\Other`, 'Savira'));
});
test('rejects relative or empty install folders', () => {
  for (const input of ['', '   ', 'Programs\\Savira', '..\\Savira', null, 42, 'C:\\' + 'a'.repeat(500)]) assert.throws(() => resolveInstallDir(input));
});
test('starts the installer only from the setup exe or explicit flags', () => {
  assert.equal(detectMode(['Savira.exe'], {}, true), null);
  assert.equal(detectMode(['Savira.exe'], { PORTABLE_EXECUTABLE_FILE: 'C:\\Setup.exe' }, true), 'setup');
  assert.equal(detectMode(['electron', '.'], { PORTABLE_EXECUTABLE_FILE: 'C:\\Setup.exe' }, false), null);
  assert.equal(detectMode(['electron', '.', '--setup'], {}, false), 'setup');
  assert.equal(detectMode(['Savira.exe', '--uninstall'], { PORTABLE_EXECUTABLE_FILE: 'x' }, true), 'uninstall');
});
