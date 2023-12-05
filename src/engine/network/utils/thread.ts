import {uniqBy, identity, prop, sortBy} from "ramda"
import {batch} from "hurdak"
import {Tags} from "paravel"
import {getIdOrAddress} from 'src/util/nostr'
import type {DisplayEvent} from "src/engine/notes/model"
import type {Event} from "src/engine/events/model"
import {writable} from "src/engine/core/utils"
import {selectHints} from "src/engine/relays/utils"
import {getIds} from "src/engine/events/utils"
import {getIdFilters} from "./filters"
import {load} from "./load"

const getAncestorIds = e => {
  const {roots, replies, mentions} = Tags.from(e).getAncestors()

  return [
    ...roots.values().all(),
    ...replies.values().all(),
    ...mentions.values().all(),
  ]
}

export class ThreadLoader {
  stopped = false
  parent = writable<DisplayEvent>(null)
  ancestors = writable<DisplayEvent[]>([])
  root = writable<DisplayEvent>(null)

  constructor(
    readonly note: Event,
    readonly relays: string[],
  ) {
    this.loadNotes(getAncestorIds(note))
  }

  stop() {
    this.stopped = true
  }

  loadNotes(ids) {
    if (this.stopped) {
      return
    }

    const seen = new Set(this.getThread().flatMap(getIds))
    const filteredIds = ids.filter(id => id && !seen.has(id))

    if (filteredIds.length > 0) {
      load({
        relays: selectHints(this.relays),
        filters: getIdFilters(filteredIds),
        onEvent: batch(300, (events: Event[]) => {
          this.addToThread(events)
          this.loadNotes(events.flatMap(getAncestorIds))
        }),
      })
    }
  }

  // Thread building

  getThread() {
    const {root, ancestors, parent} = this

    return [root.get(), ...ancestors.get(), parent.get()].filter(identity)
  }

  addToThread(events) {
    const tags = Tags.from(this.note)
    const ancestors = []

    for (const event of events) {
      if (tags.replies().values().has(getIdOrAddress(event))) {
        this.parent.set(event)
      } else if (tags.roots().values().has(getIdOrAddress(event))) {
        this.root.set(event)
      } else {
        ancestors.push(event)
      }
    }

    if (ancestors.length > 0) {
      this.ancestors.update($xs =>
        sortBy(prop("created_at"), uniqBy(prop("id"), ancestors.concat($xs))),
      )
    }
  }
}
