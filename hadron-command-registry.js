'use strict';

const format = require('util').format;
const _ = require('lodash');

const clearCut = require('clear-cut');
const calculateSpecificity = clearCut.calculateSpecificity;
const validateSelector = clearCut.validateSelector;

const eventKit = require('event-kit');
const Emitter = eventKit.Emitter;
const CompositeDisposable = eventKit.CompositeDisposable;
const Disposable = eventKit.Disposable;
const debug = require('debug')('hadron-command-registry');

function undasherize(string) {
  string = string || '';
  return string.split('-').map(_.capitalize).join(' ');
}

function humanizeEventName(eventName) {
  var p = eventName.split(':');

  var namespace = p[0];
  var event = p[1];

  if (!event) {
    return undasherize(namespace);
  }

  return format('%s: %s', undasherize(namespace), undasherize(event));
}


let _sequenceCount = 0;

class SelectorBasedListener {
  constructor(selector, callback) {
    this.selector = selector;
    this.callback = callback;
    this.specificity = calculateSpecificity(this.selector);
    this.sequenceNumber = _sequenceCount++;
  }
  compare(other) {
    return other.specificity - this.specificity ||
      other.sequenceNumber - this.sequenceNumber;
  }
}

class InlineListener {
  constructor(callback) {
    this.callback = callback;
  }
}

/**
 * Associates listener functions with commands in a  context-sensitive way using
 * CSS selectors. You can access a global instance of this class via
 * `atom.commands`, and commands registered there will be presented in the command
 * palette. The global command registry facilitates a style of event handling
 * known as *event delegation* that was popularized by jQuery.
 * Atom commands are expressed as custom DOM events that can be invoked on  the
 * currently focused element via a key binding or manually via the command
 * palette. Rather than binding listeners for command events directly to DOM
 * nodes, you instead register command event listeners globally on `atom.commands`
 * and constrain them to specific kinds of elements with CSS selectors. Command
 * names must follow the `namespace:action` pattern, where `namespace` will
 * typically be the name of your package, and `action` describes the behavior of
 * your command.  *
 * If either part consists of multiple words, these must be separated by hyphens.
 * E.g. `awesome-package:turn-it-up-to-eleven`. All words should be lowercased. As
 * the event bubbles upward through the DOM, all registered event listeners with
 * matching selectors are invoked in order of specificity. In the event of
 * specificity tie, the most recently registered listener is invoked first. This
 * mirrors the 'cascade' semantics of CSS. Event listeners are invoked in the
 * context of the current DOM node, meaning `this` always points at
 * `event.currentTarget`. As is normally the case with DOM events,
 * `stopPropagation` and `stopImmediatePropagation` can be used to terminate the
 * bubbling process and prevent invocation of additional listeners.

 * @example
 * ```coffee
 * atom.commands.add 'atom-text-editor',
 *  'user:insert-date': (event) ->
 *    editor = @getModel()
 *    editor.insertText(new Date().toLocaleString())
 * ```
 */
class CommandRegistry {
  constructor() {
    this.handleCommandEvent = _.bind(this.handleCommandEvent, this);
    this.rootNode = null;
    this.clear();
  }
  clear() {
    this.registeredCommands = {};
    this.selectorBasedListenersByCommandName = {};
    this.inlineListenersByCommandName = {};
    this.emitter = new Emitter();
  }
  attach(rootNode) {
    debug('attaching');
    this.rootNode = rootNode;

    _.each(this.selectorBasedListenersByCommandName,
      this.commandRegistered, this);

    _.each(this.inlineListenersByCommandName,
      this.commandRegistered, this);
  }

  destroy() {
    debug('destroying');
    Object.keys(this.registeredCommands)
      .forEach((commandName) => {
        this.rootNode.removeEventListener(commandName,
          this.handleCommandEvent, true);
      });
  }
  /**
   * Add one or more command listeners associated with a selector.
   *
   * @param {String} target A CSS selector or a DOM element. If you
   *  pass a selector, the command will be globally associated with all matching
   *   elements. The `,` combinator is not currently supported. If you pass a
   *   DOM element, the command will be associated with just that element.
   * @param {String|Object} commandName The name of a command you want to
   *   handle e.g. `user:insert-date`.  When passed an Object, no `callback`
   *   argument should be passed.
   * @param {Function} callback A callback to run when the given command is
   *   invoked on an element matching the selector. It will be called with `this`
   *   referencing the matching DOM node.
   *   * `event` A standard DOM event instance. Call `stopPropagation` or
   *     `stopImmediatePropagation` to terminate bubbling early.
   *
   * @returns {Disposable} on which `.dispose()` can be called to remove the
   * added command callback(s).
   */
  add(target, commandName, callback) {
    if (typeof commandName === 'object') {
      const commands = commandName;
      const disposable = new CompositeDisposable();
      _.each(commands, (cb, name) =>
        disposable.add(this.add(target, name, cb)));

      return disposable;
    }

    if (typeof callback !== 'function') {
      throw new TypeError('Command callback must be a function.');
    }

    if (typeof target === 'string') {
      validateSelector(target);
      return this.addSelectorBasedListener(target, commandName, callback);
    }

    return this.addInlineListener(target, commandName, callback);
  }
  addSelectorBasedListener(selector, commandName, callback) {
    debug('add listener for `%s` on selector `%s`', commandName, selector);
    if (!this.selectorBasedListenersByCommandName[commandName]) {
      this.selectorBasedListenersByCommandName[commandName] = [];
    }

    const listenersForCommand = this.selectorBasedListenersByCommandName[commandName];

    const listener = new SelectorBasedListener(selector, callback);
    listenersForCommand.push(listener);
    this.commandRegistered(commandName);

    return new Disposable(() => {
      listenersForCommand.splice(listenersForCommand.indexOf(listener), 1);
      if (listenersForCommand.length === 0) {
        delete this.selectorBasedListenersByCommandName[commandName];
      }
    });
  }
  addInlineListener(element, commandName, callback) {
    if (!this.inlineListenersByCommandName[commandName]) {
      this.inlineListenersByCommandName[commandName] = new WeakMap();
    }

    const listenersForCommand = this.inlineListenersByCommandName[commandName];
    let listenersForElement = listenersForCommand.get(element);

    if (!listenersForElement) {
      listenersForElement = [];
      listenersForCommand.set(element, listenersForElement);
    }

    const listener = new InlineListener(callback);
    listenersForElement.push(listener);
    this.commandRegistered(commandName);

    return new Disposable(function() {
      listenersForElement.splice(listenersForElement.indexOf(listener), 1);
      if (listenersForElement.length === 0) {
        return listenersForCommand.delete(element);
      }
    });
  }
  /**
   * Find all registered commands matching a query.
   *
   * @param {Object} arg One one or more of the following keys:
   *  - `target` A DOM node that is the hypothetical target of a given command.
   *
   * @returns {Array<Object>} With the following keys:
   *   - `name` The name of the command e.g. `user:insert-date`.
   *   - `displayName` The display name of the command e.g. `User: Insert Date`.
   */
  findCommands(arg) {
    const target = arg.target;
    const commandNames = new Set();
    const commands = [];
    let currentTarget = target;
    const searchInline = (listeners, name) => {
      if (listeners.has(currentTarget) && !_.includes(commandNames, name)) {
        commandNames.add(name);
        commands.push({
          name: name,
          displayName: humanizeEventName(name)
        });
      }
    };

    const searchSelectors = (listeners, name) => {
      _.each(listeners, (listener) => {
        if (typeof currentTarget.webkitMatchesSelector === 'function' ? currentTarget.webkitMatchesSelector(listener.selector) : void 0) {
          if (!_.has(commandNames, name)) {
            commandNames.add(name);
            commands.push({
              name: name,
              displayName: humanizeEventName(name)
            });
          }
        }
      });
    };

    while (true) {
      _.each(this.inlineListenersByCommandName, searchInline);
      _.each(this.selectorBasedListenersByCommandName, searchSelectors);
      if (currentTarget === window) { break; }
      currentTarget = currentTarget.parentNode || window;
    }
    return commands;
  }
  dispatch(target, commandName, detail) {
    debug('dispatch command `%s`', commandName, {
      target: target,
      detail: detail
    });
    const event = new CustomEvent(commandName, {
      bubbles: true,
      detail: detail
    });
    Object.defineProperty(event, 'target', {
      value: target
    });
    return this.handleCommandEvent(event);
  }
  onWillDispatch(fn) {
    return this.emitter.on('will-dispatch', fn);
  }

  onDidDispatch(fn) {
    return this.emitter.on('did-dispatch', fn);
  }

  getSnapshot() {
    const snapshot = {};
    _.each(this.selectorBasedListenersByCommandName, (listeners, name) => {
      snapshot[name] = listeners.slice();
    });
    return snapshot;
  }
  restoreSnapshot(snapshot) {
    this.selectorBasedListenersByCommandName = {};
    _.each(snapshot, (listeners, commandName) => {
      this.selectorBasedListenersByCommandName[commandName] = listeners.slice();
    });
  }

  handleCommandEvent(event) {
    let propagationStopped = false;
    let immediatePropagationStopped = false;
    let matched = false;
    let currentTarget = event.target;

    const dispatchedEvent = new CustomEvent(event.type, {
      bubbles: true,
      detail: event.detail
    });

    Object.defineProperty(dispatchedEvent, 'eventPhase', {
      value: Event.BUBBLING_PHASE
    });

    Object.defineProperty(dispatchedEvent, 'currentTarget', {
      get: function() {
        return currentTarget;
      }
    });

    Object.defineProperty(dispatchedEvent, 'target', {
      value: currentTarget
    });

    Object.defineProperty(dispatchedEvent, 'preventDefault', {
      value: function() {
        return event.preventDefault();
      }
    });

    Object.defineProperty(dispatchedEvent, 'stopPropagation', {
      value: function() {
        event.stopPropagation();
        propagationStopped = true;
        return propagationStopped;
      }
    });

    Object.defineProperty(dispatchedEvent, 'stopImmediatePropagation', {
      value: function() {
        event.stopImmediatePropagation();
        propagationStopped = true;
        immediatePropagationStopped = true;
        return immediatePropagationStopped;
      }
    });

    Object.defineProperty(dispatchedEvent, 'abortKeyBinding', {
      value: function() {
        return typeof event.abortKeyBinding === 'function' ? event.abortKeyBinding() : void 0;
      }
    });

    _.assign(dispatchedEvent, event);
    this.emitter.emit('will-dispatch', dispatchedEvent);

    const listenerMatchesSelector = function(listener) {
      return currentTarget.webkitMatchesSelector(listener.selector);
    };

    const selectorBasedCompare = function(a, b) {
      return a.compare(b);
    };

    const callListenersUntilImmediatePropagationStopped = function(listener) {
      if (immediatePropagationStopped) {
        return false;
      }
      listener.callback.call(currentTarget, dispatchedEvent);
      return true;
    };

    /* eslint no-loop-func: 1 */
    while (true) {
      const listeners = [];
      if (this.inlineListenersByCommandName[event.type]) {
        listeners.push.apply(listeners,
          this.inlineListenersByCommandName[event.type].get(currentTarget));
      }

      if (currentTarget.webkitMatchesSelector) {
        const selectorBasedListeners = (this.selectorBasedListenersByCommandName[event.type] || [])
          .filter(listenerMatchesSelector)
          .sort(selectorBasedCompare);

        listeners.push.apply(listeners, selectorBasedListeners);
      }

      if (listeners.length > 0) {
        matched = true;
      }

      _.every(listeners, callListenersUntilImmediatePropagationStopped);
      if (immediatePropagationStopped) {
        break;
      }

      if (currentTarget === window) {
        break;
      }

      if (propagationStopped) {
        break;
      }

      currentTarget = currentTarget.parentNode || window;
    }
    this.emitter.emit('did-dispatch', dispatchedEvent);
    debug('matched?', matched);
    return matched;
  }

  commandRegistered(commandName) {
    if ((this.rootNode !== null) && !this.registeredCommands[commandName]) {
      this.rootNode.addEventListener(commandName,
        this.handleCommandEvent, true);
      this.registeredCommands[commandName] = true;
    }
    var res = this.registeredCommands[commandName];
    debug('command `%s` registered?', commandName, res);
    return res;
  }
}
module.exports = CommandRegistry;
