import {nip19, nip04, getPublicKey, getEventHash, signEvent} from "nostr-tools"
import {get} from "svelte/store"
import {error} from "src/util/logger"
import {synced} from "src/util/misc"
import NDK, { NDKEvent, NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk"

const method = synced("agent/keys/method")
const pubkey = synced("agent/keys/pubkey")
const privkey = synced("agent/keys/privkey")
const getExtension = () => (window as {nostr?: any}).nostr
const canSign = () => {
  return ["nip46", "privkey", "extension"].includes(get(method))
}

// Validate the key before setting it to state by encoding it using bech32.
// This will error if invalid (this works whether it's a public or a private key)
const validate = key => nip19.npubEncode(key)

let ndk, remoteSigner;

async function prepareNdk(token?: string): Promise<void> {
  const $privkey = get(privkey);
  const $pubkey = get(pubkey);

  const localSigner = new NDKPrivateKeySigner($privkey);
  ndk = new NDK({
    explicitRelayUrls: ['wss://nostr.vulpem.com', 'wss://relay.f7z.io', 'wss://relay.damus.io', 'wss://relay.nsecbunker.com']
  })
  remoteSigner = new NDKNip46Signer(ndk, $pubkey, localSigner);
  remoteSigner.token = token;
  ndk.signer = remoteSigner;
  ndk.connect(5000).then(() => {
    console.log(`ndk came back from connect`)
    remoteSigner.blockUntilReady().then(() => {
      console.log(`ndk came back from blockUntilReady`)
    })
  });
}

const login = ($method, key) => {
  method.set($method)

  switch ($method) {
    case "nip46": {
      const {remotePubkey, localPrivkey, token} = key;

      privkey.set(localPrivkey)
      pubkey.set(remotePubkey)

      prepareNdk(token).then(() => {
        console.log(`✅ ndk ready`)
      });
      break
    }
    case "privkey":
      privkey.set(key)
      pubkey.set(getPublicKey(key))
      break;
    default:
      privkey.set(null)
      pubkey.set(key)
  }
}

const clear = () => {
  method.set(null)
  pubkey.set(null)
  privkey.set(null)
}

const sign = event => {
  const $method = get(method)

  event.pubkey = get(pubkey)
  event.id = getEventHash(event)

  if ($method === "nip46") {
    const signEvent = (resolve, reject) => {
      const ndkEvent = new NDKEvent(ndk, event);
      console.log(`ndk sending sign request`, ndkEvent.rawEvent())
      ndkEvent.sign(remoteSigner).then(() => {
        console.log(`ndk ✅`, ndkEvent.rawEvent())
        resolve(ndkEvent.rawEvent());
      }).catch((e) => {
        console.log(`ndk`, e)
        reject(e);
      });
    }
    const promise = new Promise((resolve, reject) => {
      if (!ndk) {
        prepareNdk().then(() => {
          signEvent(resolve, reject)
        });
      } else {
        signEvent(resolve, reject)
      }
    });
    return promise;

  } else if ($method === "privkey") {
    return Object.assign(event, {
      sig: signEvent(event, get(privkey)),
    })
  }

  if ($method === "extension") {
    return getExtension().signEvent(event)
  }

  throw new Error(`Unable to sign event, method is ${$method}`)
}

const getCrypt = () => {
  const $method = get(method)

  if ($method === "privkey") {
    const $privkey = get(privkey)

    return {
      encrypt: (pubkey, message) => nip04.encrypt($privkey, pubkey, message),
      decrypt: async (pubkey, message) => {
        try {
          return nip04.decrypt($privkey, pubkey, message)
        } catch (e) {
          error(e)

          return `<Failed to decrypt message: ${e}>`
        }
      },
    }
  }

  if ($method === "extension") {
    return {
      encrypt: (pubkey, message) => getExtension().nip04.encrypt(pubkey, message),
      decrypt: async (pubkey, message) => {
        try {
          return await getExtension().nip04.decrypt(pubkey, message)
        } catch (e) {
          error(e)

          return `<Failed to decrypt message: ${e}>`
        }
      },
    }
  }

  throw new Error("No encryption method available.")
}

const encryptJson = data => getCrypt().encrypt(get(pubkey), JSON.stringify(data))

const decryptJson = async data => {
  try {
    return JSON.parse(await getCrypt().decrypt(get(pubkey), data))
  } catch (e) {
    console.warn(e)

    return null
  }
}

export default {
  method,
  pubkey,
  privkey,
  canSign,
  validate,
  login,
  clear,
  sign,
  getCrypt,
  encryptJson,
  decryptJson,
}
