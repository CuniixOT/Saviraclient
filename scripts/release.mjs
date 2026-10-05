// Release helper for the auto-updater.
//   node scripts/release.mjs keygen    one-time: signing key outside the project, public key into package.json
//   node scripts/release.mjs manifest  after `npm run dist`: writes the signed release/latest.json
//   node scripts/release.mjs configure owner/repo  CI: sets the update repository before building
// In GitHub Actions the key comes from the SAVIRA_UPDATE_KEY_PEM secret instead of a file.
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import updater from '../electron/updater.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = process.env.SAVIRA_UPDATE_KEY || path.join(os.homedir(), '.savira-release', 'update-private.pem');
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(await readFile(pkgFile, 'utf8'));
const exists = file => access(file).then(() => true, () => false);
const command = process.argv[2];

if (command === 'keygen') {
  if (await exists(keyFile)) throw new Error(`Es gibt bereits einen Signaturschlüssel: ${keyFile}\nEin neuer Schlüssel würde Updates für alle installierten Versionen unmöglich machen.`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  await mkdir(path.dirname(keyFile), { recursive: true });
  await writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  pkg.saviraUpdate = { ...pkg.saviraUpdate, publicKey: publicKey.export({ type: 'spki', format: 'pem' }) };
  await writeFile(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Signaturschlüssel erstellt: ${keyFile}`);
  console.log('Sichere diese Datei (z. B. Passwortmanager). Ohne sie kannst du keine Updates mehr veröffentlichen.');
  console.log('Der öffentliche Schlüssel steht jetzt in package.json → saviraUpdate.publicKey.');
} else if (command === 'configure') {
  const repo = process.argv[3] || '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Verwendung: node scripts/release.mjs configure besitzer/repo');
  if (pkg.saviraUpdate?.github && pkg.saviraUpdate.github !== repo) console.log(`Hinweis: package.json nennt ${pkg.saviraUpdate.github}, verwendet wird ${repo}.`);
  pkg.saviraUpdate = { ...pkg.saviraUpdate, github: repo };
  await writeFile(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Update-Repository: ${repo}`);
} else if (command === 'manifest') {
  const file = `Savira-Setup-${pkg.version}.exe`;
  const setup = path.join(root, 'release', file);
  if (!await exists(setup)) throw new Error(`${file} fehlt. Zuerst "npm run dist" ausführen.`);
  let keyPem = process.env.SAVIRA_UPDATE_KEY_PEM?.trim();
  if (!keyPem) {
    if (process.env.GITHUB_ACTIONS) throw new Error('Das Secret SAVIRA_UPDATE_KEY fehlt. Inhalt von update-private.pem unter Settings → Secrets and variables → Actions hinterlegen.');
    if (!await exists(keyFile)) throw new Error(`Kein Signaturschlüssel unter ${keyFile}. Einmalig "npm run release:keygen" ausführen.`);
    keyPem = await readFile(keyFile, 'utf8');
  }
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(setup)) hash.update(chunk);
  // Release notes: every "- " line of release-notes.md.
  let notes = [];
  try { notes = (await readFile(path.join(root, 'release-notes.md'), 'utf8')).split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim()); } catch { /* Optional. */ }
  const manifest = { version: pkg.version, file, sha512: hash.digest('hex'), size: (await stat(setup)).size, date: new Date().toISOString(), notes };
  manifest.signature = sign(null, Buffer.from(updater.signedPayload(manifest)), createPrivateKey(keyPem)).toString('base64');
  // Fail here rather than on players' machines if key and package.json do not match.
  updater.validateManifest(manifest, pkg.saviraUpdate?.publicKey);
  await writeFile(path.join(root, 'release', 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  // Text for the GitHub release page; the workflow passes it to `gh release create`.
  const download = `**Download:** \`${file}\` herunterladen und starten. Bestehende Installationen aktualisieren sich automatisch.`;
  await writeFile(path.join(root, 'release', 'notes.md'), [...(notes.length ? ['## Neu in dieser Version', '', ...notes.map(note => `- ${note}`), ''] : []), download, ''].join('\n'));
  console.log(`release/latest.json für ${pkg.version} geschrieben und signiert.`);
  console.log(`Lade "${file}" und "latest.json" gemeinsam hoch (z. B. als Anhänge eines GitHub-Release).`);
} else {
  console.log('Verwendung: node scripts/release.mjs keygen | manifest | configure besitzer/repo');
  process.exitCode = 1;
}
