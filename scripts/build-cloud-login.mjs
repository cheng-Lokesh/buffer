import {build} from 'esbuild';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'dist-cloud-login');
await mkdir(output,{recursive:true});
await build({entryPoints:[resolve(root,'server/cloudbase-http-entry.js')],outfile:resolve(output,'index.js'),bundle:true,platform:'node',target:'node20',format:'cjs',sourcemap:false,logLevel:'silent'});
await copyFile(resolve(root,'cloud-functions/buffer-login/package.json'),resolve(output,'package.json'));
// Normalize the executable startup script for Linux, regardless of Git CRLF.
const {writeFile}=await import('node:fs/promises');
await writeFile(resolve(output,'scf_bootstrap'),(await readFile(resolve(root,'cloud-functions/buffer-login/scf_bootstrap'),'utf8')).replace(/\r\n/g,'\n'),{mode:0o755});
const bundle=await readFile(resolve(output,'index.js'),'utf8');
if(/BEGIN (RSA )?PRIVATE KEY|sk-[A-Za-z0-9]{20,}/.test(bundle))throw Error('cloud_bundle_secret_check_failed');
process.stdout.write('cloud_login_bundle_ready_without_credentials\n');
