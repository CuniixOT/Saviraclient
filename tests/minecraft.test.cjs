const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { allowed, argumentsFor, mavenArtifact, contained, javaArgument, legacyArguments } = require('../electron/minecraft.cjs');

test('Minecraft OS rules use last matching rule and default deny', () => {
  assert.equal(allowed(undefined), true);
  assert.equal(allowed([{ action: 'allow', os: { name: 'osx' } }], {}, 'win32'), false);
  assert.equal(allowed([{ action: 'allow' }, { action: 'disallow', os: { name: 'windows' } }], {}, 'win32'), false);
  assert.equal(allowed([{ action: 'allow', os: { name: 'windows', arch: 'x86_64' } }], {}, 'win32', 'x64'), true);
});
test('conditional arguments, arrays and token substitution are resolved without shell', () => {
  const args = ['--username', '${name}', { rules: [{ action: 'allow', features: { has_custom_resolution: true } }], value: ['--width', '${width}'] }, { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' }];
  assert.deepEqual(argumentsFor(args, { name: 'SaviraPlayer', width: 1280 }, { has_custom_resolution: true }), ['--username', 'SaviraPlayer', '--width', '1280']);
  assert.throws(() => argumentsFor(['${unknown}'], {}, {}));
});
test('metadata paths cannot escape installation directory', () => {
  const root = path.resolve('instance');
  assert.equal(contained(root, 'assets/abc'), path.join(root, 'assets', 'abc'));
  assert.throws(() => contained(root, '../outside'));
  assert.throws(() => contained(root, root));
});
test('Fabric Maven artifact paths include classifiers', () => {
  assert.deepEqual(mavenArtifact({ name: 'net.fabricmc:loader:0.16.14', url: 'https://maven.fabricmc.net/' }), { path: 'net/fabricmc/loader/0.16.14/loader-0.16.14.jar', url: 'https://maven.fabricmc.net/net/fabricmc/loader/0.16.14/loader-0.16.14.jar' });
  assert.equal(mavenArtifact({ name: 'org.lwjgl:lwjgl:3.3.3:natives-windows' }).path, 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar');
});
test('Java argfile encoding handles Windows paths with spaces', () => {
  assert.equal(javaArgument('C:\\Users\\Test User\\game'), '"C:\\\\Users\\\\Test User\\\\game"');
  assert.equal(javaArgument('a"b'), '"a\\"b"');
});
test('legacy Minecraft argument strings retain quoted values', () => {
  assert.deepEqual(legacyArguments('--username ${auth_player_name} --title "Savira Client"'), ['--username', '${auth_player_name}', '--title', 'Savira Client']);
});
