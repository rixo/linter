/* @flow */

import { Emitter, CompositeDisposable } from 'atom'
import type { Disposable } from 'atom'

import IndieDelegate from './indie-delegate'
import { indie as validateIndie } from './validate'
import type { Indie } from './types'

class IndieRegistry {
  emitter: Emitter
  delegates: Set<IndieDelegate>
  subscriptions: CompositeDisposable
  disabledProviders: Array<string>

  constructor() {
    this.emitter = new Emitter()
    this.delegates = new Set()
    this.subscriptions = new CompositeDisposable()
    this.disabledProviders = []

    this.subscriptions.add(
      atom.config.observe('linter.disabledProviders', disabledProviders => {
        this.updateDisabledProviders(disabledProviders)
      }),
    )
    this.subscriptions.add(this.emitter)
  }
  // Public method
  register(config: Indie, version: 2): IndieDelegate {
    if (!validateIndie(config)) {
      throw new Error('Error registering Indie Linter')
    }
    const indieLinter = new IndieDelegate(config, version)
    this.delegates.add(indieLinter)
    indieLinter.onDidDestroy(() => {
      this.delegates.delete(indieLinter)
    })
    indieLinter.onDidUpdate(messages => {
      // guard: don't update messages for disabled providers
      if (this.disabledProviders.includes(indieLinter.name)) {
        return
      }
      this.emitter.emit('did-update', { linter: indieLinter, messages })
    })
    this.emitter.emit('observe', indieLinter)

    return indieLinter
  }
  updateDisabledProviders(disabledProviderNames: String[]): void {
    const isNewlyDisabled = name => !this.disabledProviders.includes(name)
    const isNoMoreDisabled = name => !disabledProviderNames.includes(name)

    const hideLinterMessages = targetName => {
      const isTarget = ({name}) => name === targetName
      const indieLinter = [...this.delegates].find(isTarget)
      if (indieLinter) {
        this.emitter.emit('did-update', { linter: indieLinter, messages: [] })
      }
    }

    const showLinterMessages = targetName => {
      const isTarget = ({name}) => name === targetName
      const indieLinter = [...this.delegates].find(isTarget)
      if (indieLinter) {
        const messages = indieLinter.getMessages()
        this.emitter.emit('did-update', { linter: indieLinter, messages })
      }
    }

    const newlyDisabledNames = disabledProviderNames.filter(isNewlyDisabled)
    const newlyEnabledNames = this.disabledProviders.filter(isNoMoreDisabled)

    this.disabledProviders = newlyDisabledNames

    newlyDisabledNames.forEach(hideLinterMessages)
    newlyEnabledNames.forEach(showLinterMessages)
  }
  getProviders(): Array<IndieDelegate> {
    return Array.from(this.delegates)
  }
  observe(callback: Function): Disposable {
    this.delegates.forEach(callback)
    return this.emitter.on('observe', callback)
  }
  onDidUpdate(callback: Function): Disposable {
    return this.emitter.on('did-update', callback)
  }
  dispose() {
    for (const entry of this.delegates) {
      entry.dispose()
    }
    this.subscriptions.dispose()
  }
}

export default IndieRegistry
