import EventEmitter from "events"
import {defer, union, difference} from "hurdak"
import {info} from "src/util/logger"
import type {Event, NostrEvent} from "src/engine2/model"
import {getUrls, getExecutor} from "src/engine2/queries"
import {projections} from "src/engine2/projections"

export type PublisherOpts = {
  timeout?: number
  verb?: string
}

export type StaticPublisherOpts = PublisherOpts & {
  event: NostrEvent
  relays: string[]
}

export class Publisher extends EventEmitter {
  result = defer()
  event: NostrEvent

  constructor(event: NostrEvent) {
    super()

    if ((event as Event).wrap) {
      throw new Error("Can't publish unwrapped events")
    }

    this.event = event
  }

  static publish({event, relays, ...opts}: StaticPublisherOpts) {
    const publisher = new Publisher(event)

    publisher.publish(relays, opts)

    return publisher
  }

  publish(relays, {timeout, verb}: PublisherOpts = {}) {
    const urls = getUrls(relays)
    const executor = getExecutor(urls)

    info(`Publishing to ${urls.length} relays`, this.event, urls)

    const timeouts = new Set<string>()
    const succeeded = new Set<string>()
    const failed = new Set<string>()

    const getProgress = () => {
      const attempted = new Set(urls)
      const completed = union(timeouts, succeeded, failed)
      const pending = difference(attempted, completed)

      return {event: this.event, attempted, succeeded, failed, timeouts, completed, pending}
    }

    const attemptToResolve = () => {
      const progress = getProgress()

      if (progress.pending.size === 0) {
        sub.unsubscribe()
        executor.target.cleanup()
        this.result.resolve(progress)
      }

      this.emit("progress", progress)
    }

    projections.push({...this.event, seen_on: []})

    setTimeout(() => {
      for (const url of urls) {
        if (!succeeded.has(url) && !failed.has(url)) {
          timeouts.add(url)
        }
      }

      attemptToResolve()
    }, timeout)

    // return console.log('PUBLISH', this.event)

    const sub = executor.publish(this.event, {
      verb,
      onOk: (url: string) => {
        succeeded.add(url)
        timeouts.delete(url)
        failed.delete(url)
        attemptToResolve()
      },
      onError: (url: string) => {
        failed.add(url)
        timeouts.delete(url)
        attemptToResolve()
      },
    })

    // Report progress to start with
    attemptToResolve()
  }
}
