<script lang="ts">
  import {toHex} from "src/util/nostr"
  import Input from "src/partials/Input.svelte"
  import Anchor from "src/partials/Anchor.svelte"
  import Content from "src/partials/Content.svelte"
  import Heading from "src/partials/Heading.svelte"
  import keys from "src/agent/keys"
  import {toast} from "src/partials/state"
  import {login} from "src/app/state"
  import { onMount } from "svelte"
  import {generatePrivateKey} from "nostr-tools"

  let privkey;

  onMount(() => {
    // try to read privkey from localStorage
    privkey = localStorage.getItem("privkey")

    // if not found, generate a new one
    if (!privkey) {
      privkey = generatePrivateKey()
      localStorage.setItem("privkey", privkey)
    }
  });

  let npub = ""

  const logIn = () => {
    let [ pubkey, token ] = npub.split("#")
    pubkey = toHex(pubkey);

    try {
      keys.validate(pubkey)
    } catch (e) {
      toast.show("error", `Sorry, but that's an invalid public key. ${pubkey}`)

      return
    }

    login("nip46", {
      remotePubkey: pubkey,
      localPrivkey: privkey,
      token
    });
  }
</script>

<Content size="lg" class="text-center">
  <Heading>Login with nsecBunker</Heading>
  <p>
    nsecBunker allows you to use Nostr without providing keys to this client.
  </p>
  <div class="flex gap-2">
    <div class="flex-grow">
      <Input bind:value={npub} placeholder="npub...">
        <i slot="before" class="fa fa-key" />
      </Input>
    </div>
    <Anchor type="button" on:click={logIn}>Log In</Anchor>
  </div>
</Content>
