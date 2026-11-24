import { mkdir, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '8.12.1';
const tools = path.join(root, '.tools');
const gradleHome = path.join(tools, `gradle-${version}`);
const gradleJar = path.join(gradleHome, 'lib', `gradle-launcher-${version}.jar`);
async function run(command, args, cwd = root) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} wurde mit Code ${code} beendet.`)));
  });
}
try {
  await access(gradleJar);
} catch {
  console.log(`Gradle ${version} wird einmalig heruntergeladen …`);
  await mkdir(tools, { recursive: true });
  const url = `https://services.gradle.org/distributions/gradle-${version}-bin.zip`;
  // CI starts without Gradle whenever its cache expired; a dropped download is tried again.
  let bytes;
  for (let attempt = 1; ; attempt++) {
    try {
      const [response, checksumResponse] = await Promise.all([fetch(url), fetch(`${url}.sha256`)]);
      if (!response.ok || !checksumResponse.ok) throw new Error(`Gradle-Download fehlgeschlagen (HTTP ${response.status} / ${checksumResponse.status}).`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== (await checksumResponse.text()).trim()) throw new Error('Gradle-Prüfsumme stimmt nicht.');
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
      console.log(`${error.message} Neuer Versuch ${attempt + 1}/4 …`);
      await new Promise(resolve => setTimeout(resolve, attempt * 5000));
    }
  }
  const archive = path.join(tools, `gradle-${version}.zip`);
  await writeFile(archive, bytes);
  // Windows 10+ ships bsdtar, which reads zip files; called by its full path, since Git's GNU tar
  // (often first in PATH) cannot. PowerShell's Expand-Archive broke on the GitHub runners.
  if (process.platform === 'win32') await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', tools]);
  else await run('unzip', ['-q', '-o', archive, '-d', tools]);
  try { await access(gradleJar); } catch { throw new Error(`Gradle ${version} wurde nicht entpackt: ${gradleJar} fehlt.`); }
}
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
await run(java, ['-classpath', gradleJar, 'org.gradle.launcher.GradleMain', '--no-daemon', 'build', ...(process.argv.includes('--menu') ? ['remapMenuTest'] : [])], path.join(root, 'client-mod'));
await access(path.join(root, 'client-mod/build/libs/savira-client-0.1.0.jar'));
console.log('Savira-Mod gebaut: client-mod/build/libs/savira-client-0.1.0.jar');
