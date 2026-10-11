import {createCloudBaseLoginServer} from './cloudbase-login-host.js';
import {loadCloudBaseLoginConfig} from './cloudbase-login-config.js';

async function start(){
  try {
    const port=Number(process.env.PORT||9000);
    if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error();
    const config=loadCloudBaseLoginConfig(process.env);
    const server=await createCloudBaseLoginServer({config});
    server.on('error',()=>{process.stderr.write('cloud_login_host_error\n');process.exitCode=1;});
    server.listen(port,'0.0.0.0',()=>process.stdout.write('cloud_login_ready\n'));
    process.on('SIGTERM',()=>server.close());
  }catch{process.stderr.write('cloud_login_startup_failed\n');process.exitCode=1;}
}
start();
