import { createPrivateKey } from 'node:crypto';
import jwt from 'jsonwebtoken';

/** Server only. Never import from site/ or miniprogram/. Credentials must be
 * loaded from a private server secret file, not a browser/WeChat bundle. */
export async function createCloudBaseTicketSigner({envId,credentials,keyPolicy='rsa2048'}={}) {
  let cloudBase1024=false;
  try {
    if(!['rsa2048','cloudbase-rsa1024'].includes(keyPolicy)) throw new Error('policy');
    if(typeof envId!=='string' || !envId || credentials?.env_id!==envId || typeof credentials.private_key_id!=='string' || !credentials.private_key_id) throw new Error('config');
    const key=createPrivateKey(credentials.private_key);
    cloudBase1024=keyPolicy==='cloudbase-rsa1024' && key.asymmetricKeyDetails?.modulusLength===1024;
    if(key.asymmetricKeyType!=='rsa' || (!cloudBase1024 && !(key.asymmetricKeyDetails?.modulusLength>=2048))) throw new Error('key');
  } catch { throw new Error('cloudbase_signer_config_invalid'); }
  // CloudBase PG custom-ticket protocol uses milliseconds, unlike ordinary JWTs.
  // Matches @cloudbase/js-sdk 3.10.1 Node createTicket without initializing its
  // browser OAuth BroadcastChannel in a server process.
  const {private_key_id:keyId,private_key:privateKey}=credentials;
  return async uid => {
    if(typeof uid!=='string' || !/^wx_[a-f0-9]{29}$/.test(uid)) throw new Error('cloudbase_signer_identity_invalid');
    const now=Date.now();
    return `${keyId}/@@/${jwt.sign({alg:'RS256',env:envId,iat:now,exp:now+5*60*1000,uid,refresh:60*1000,expire:now+5*60*1000},privateKey,{algorithm:'RS256',allowInsecureKeySizes:cloudBase1024})}`;
  };
}
