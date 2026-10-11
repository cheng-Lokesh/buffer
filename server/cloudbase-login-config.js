const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const key=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

/** Load the existing login credentials plus an optional non-JSON encoded
 * server-only feature extension. The encoding keeps CloudBase CLI from
 * coercing a JSON-valued environment variable into an object. */
export function loadCloudBaseLoginConfig(env=process.env) {
  try {
    if(!object(env)||typeof env.BUFFER_LOGIN_CONFIG!=='string'
      ||Buffer.byteLength(env.BUFFER_LOGIN_CONFIG)>16384)throw Error();
    const base=JSON.parse(env.BUFFER_LOGIN_CONFIG);
    if(!object(base))throw Error();
    const encoded=env.BUFFER_LOGIN_FEATURES_B64;
    if(encoded===undefined||encoded==='')return base;
    if(typeof encoded!=='string'||encoded.length>16384||!/^[A-Za-z0-9_-]+$/.test(encoded))throw Error();
    const source=Buffer.from(encoded,'base64url').toString('utf8');
    if(Buffer.from(source,'utf8').toString('base64url')!==encoded)throw Error();
    const extension=JSON.parse(source);
    if(!object(extension)||!Object.keys(extension).length
      ||Object.keys(extension).some(name=>!['sync','pair'].includes(name)))throw Error();
    for(const name of ['sync','pair']) {
      if(!Object.hasOwn(extension,name))continue;
      if(Object.hasOwn(base,name)||!object(extension[name])||extension[name].enabled!==true)throw Error();
      const fields=Object.keys(extension[name]);
      if(name==='sync'&&(fields.length!==2||!fields.includes('backendKey')||!key(extension[name].backendKey)))throw Error();
      if(name==='pair'&&(fields.length!==3||!fields.includes('backendKey')||!fields.includes('encryptionKey')
        ||!key(extension[name].backendKey)||!key(extension[name].encryptionKey)))throw Error();
    }
    return {...base,...extension};
  }catch{throw Error('cloud_login_config_invalid');}
}
