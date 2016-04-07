/* eslint one-var: 1, guard-for-in: 1, no-else-return: 1, no-cond-assign: 1, complexity: 1 */
var kit = require('event-kit');
var Emitter = kit.Emitter;
var Disposable = kit.Disposable;
var CompositeDisposable = kit.CompositeDisposable;

var clearCut = require('clear-cut');
var calculateSpecificity = clearCut.calculateSpecificity;
var validateSelector = clearCut.validateSelector;

var _ = require('underscore-plus');

var SequenceCount = 0;

function SelectorBasedListener(selector1, callback1) {
  this.selector = selector1;
  this.callback = callback1;
  this.specificity = calculateSpecificity(this.selector);
  this.sequenceNumber = SequenceCount++;
}

SelectorBasedListener.prototype.compare = function(other) {
  return other.specificity - this.specificity || other.sequenceNumber - this.sequenceNumber;
};

function InlineListener(callback1) {
  this.callback = callback1;
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
function CommandRegistry() {
  this.handleCommandEvent = this.handleCommandEvent.bind(this);
  // var bind = function(fn, me){
  //   return function(){
  //     return fn.apply(me, arguments);
  //   };
  // };
  // this.handleCommandEvent = bind(this.handleCommandEvent, this);
  this.rootNode = null;
  this.clear();
}

CommandRegistry.prototype.clear = function() {
  this.registeredCommands = {};
  this.selectorBasedListenersByCommandName = {};
  this.inlineListenersByCommandName = {};
  this.emitter = new Emitter();
};

CommandRegistry.prototype.attach = function(rootNode) {
  var command, results;
  this.rootNode = rootNode;
  for (command in this.selectorBasedListenersByCommandName) {
    this.commandRegistered(command);
  }
  results = [];
  for (command in this.inlineListenersByCommandName) {
    results.push(this.commandRegistered(command));
  }
  return results;
};

CommandRegistry.prototype.destroy = function() {
  var commandName;
  for (commandName in this.registeredCommands) {
    this.rootNode.removeEventListener(commandName, this.handleCommandEvent, true);
  }
};

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
CommandRegistry.prototype.add = function(target, commandName, callback) {
  var commands, disposable;
  if (typeof commandName === 'object') {
    commands = commandName;
    disposable = new CompositeDisposable;
    for (commandName in commands) {
      callback = commands[commandName];
      disposable.add(this.add(target, commandName, callback));
    }
    return disposable;
  }
  if (typeof callback !== 'function') {
    throw new Error('Can\'t register a command with non-function callback.');
  }
  if (typeof target === 'string') {
    validateSelector(target);
    return this.addSelectorBasedListener(target, commandName, callback);
  } else {
    return this.addInlineListener(target, commandName, callback);
  }
};

CommandRegistry.prototype.addSelectorBasedListener = function(selector, commandName, callback) {
  var base, listener, listenersForCommand;
  if ((base = this.selectorBasedListenersByCommandName)[commandName] == null) {
    base[commandName] = [];
  }
  listenersForCommand = this.selectorBasedListenersByCommandName[commandName];
  listener = new SelectorBasedListener(selector, callback);
  listenersForCommand.push(listener);
  this.commandRegistered(commandName);
  return new Disposable((function(_this) {
    return function() {
      listenersForCommand.splice(listenersForCommand.indexOf(listener), 1);
      if (listenersForCommand.length === 0) {
        return delete _this.selectorBasedListenersByCommandName[commandName];
      }
    };
  })(this));
};

CommandRegistry.prototype.addInlineListener = function(element, commandName, callback) {
  var base, listener, listenersForCommand, listenersForElement;
  if ((base = this.inlineListenersByCommandName)[commandName] == null) {
    base[commandName] = new WeakMap;
  }
  listenersForCommand = this.inlineListenersByCommandName[commandName];
  if (!(listenersForElement = listenersForCommand.get(element))) {
    listenersForElement = [];
    listenersForCommand.set(element, listenersForElement);
  }
  listener = new InlineListener(callback);
  listenersForElement.push(listener);
  this.commandRegistered(commandName);
  return new Disposable(function() {
    listenersForElement.splice(listenersForElement.indexOf(listener), 1);
    if (listenersForElement.length === 0) {
      return listenersForCommand.delete(element);
    }
  });
};
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
CommandRegistry.prototype.findCommands = function(arg) {
  var commandName, commandNames, commands, currentTarget, i, len, listener, listeners, name, ref2, ref3, ref4, target;
  target = arg.target;
  commandNames = new Set;
  commands = [];
  currentTarget = target;
  while (true) {
    ref2 = this.inlineListenersByCommandName;
    for (name in ref2) {
      listeners = ref2[name];
      if (listeners.has(currentTarget) && !commandNames.has(name)) {
        commandNames.add(name);
        commands.push({
          name: name,
          displayName: _.humanizeEventName(name)
        });
      }
    }
    ref3 = this.selectorBasedListenersByCommandName;
    for (commandName in ref3) {
      listeners = ref3[commandName];
      for (i = 0, len = listeners.length; i < len; i++) {
        listener = listeners[i];
        if (typeof currentTarget.webkitMatchesSelector === 'function' ? currentTarget.webkitMatchesSelector(listener.selector) : void 0) {
          if (!commandNames.has(commandName)) {
            commandNames.add(commandName);
            commands.push({
              name: commandName,
              displayName: _.humanizeEventName(commandName)
            });
          }
        }
      }
    }
    if (currentTarget === window) {
      break;
    }
    currentTarget = (ref4 = currentTarget.parentNode) != null ? ref4 : window;
  }
  return commands;
};

CommandRegistry.prototype.dispatch = function(target, commandName, detail) {
  var event;
  event = new CustomEvent(commandName, {
    bubbles: true,
    detail: detail
  });
  Object.defineProperty(event, 'target', {
    value: target
  });
  return this.handleCommandEvent(event);
};

CommandRegistry.prototype.onWillDispatch = function(callback) {
  return this.emitter.on('will-dispatch', callback);
};

CommandRegistry.prototype.onDidDispatch = function(callback) {
  return this.emitter.on('did-dispatch', callback);
};

CommandRegistry.prototype.getSnapshot = function() {
  var commandName, listeners, ref2, snapshot;
  snapshot = {};
  ref2 = this.selectorBasedListenersByCommandName;
  for (commandName in ref2) {
    listeners = ref2[commandName];
    snapshot[commandName] = listeners.slice();
  }
  return snapshot;
};

CommandRegistry.prototype.restoreSnapshot = function(snapshot) {
  var commandName, listeners;
  this.selectorBasedListenersByCommandName = {};
  for (commandName in snapshot) {
    listeners = snapshot[commandName];
    this.selectorBasedListenersByCommandName[commandName] = listeners.slice();
  }
};

CommandRegistry.prototype.handleCommandEvent = function(event) {
  var abortKeyBinding, currentTarget, dispatchedEvent, i, immediatePropagationStopped, j, key, len, len1, listener, listeners, matched, preventDefault, propagationStopped, ref2, ref3, ref4, ref5, ref6, selectorBasedListeners, stopImmediatePropagation, stopPropagation;
  propagationStopped = false;
  immediatePropagationStopped = false;
  matched = false;
  currentTarget = event.target;
  preventDefault = event.preventDefault, stopPropagation = event.stopPropagation, stopImmediatePropagation = event.stopImmediatePropagation, abortKeyBinding = event.abortKeyBinding;
  dispatchedEvent = new CustomEvent(event.type, {
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
      return propagationStopped = true;
    }
  });
  Object.defineProperty(dispatchedEvent, 'stopImmediatePropagation', {
    value: function() {
      event.stopImmediatePropagation();
      propagationStopped = true;
      return immediatePropagationStopped = true;
    }
  });
  Object.defineProperty(dispatchedEvent, 'abortKeyBinding', {
    value: function() {
      return typeof event.abortKeyBinding === 'function' ? event.abortKeyBinding() : void 0;
    }
  });
  ref2 = Object.keys(event);
  for (i = 0, len = ref2.length; i < len; i++) {
    key = ref2[i];
    dispatchedEvent[key] = event[key];
  }
  this.emitter.emit('will-dispatch', dispatchedEvent);
  while (true) {
    listeners = (ref3 = (ref4 = this.inlineListenersByCommandName[event.type]) != null ? ref4.get(currentTarget) : void 0) != null ? ref3 : [];
    if (currentTarget.webkitMatchesSelector != null) {
      selectorBasedListeners = ((ref5 = this.selectorBasedListenersByCommandName[event.type]) != null ? ref5 : []).filter(function(listener) {
        return currentTarget.webkitMatchesSelector(listener.selector);
      }).sort(function(a, b) {
        return a.compare(b);
      });
      listeners = listeners.concat(selectorBasedListeners);
    }
    if (listeners.length > 0) {
      matched = true;
    }
    for (j = 0, len1 = listeners.length; j < len1; j++) {
      listener = listeners[j];
      if (immediatePropagationStopped) {
        break;
      }
      listener.callback.call(currentTarget, dispatchedEvent);
    }
    if (currentTarget === window) {
      break;
    }
    if (propagationStopped) {
      break;
    }
    currentTarget = (ref6 = currentTarget.parentNode) != null ? ref6 : window;
  }
  this.emitter.emit('did-dispatch', dispatchedEvent);
  return matched;
};

CommandRegistry.prototype.commandRegistered = function(commandName) {
  if ((this.rootNode != null) && !this.registeredCommands[commandName]) {
    this.rootNode.addEventListener(commandName, this.handleCommandEvent, true);
    return this.registeredCommands[commandName] = true;
  }
};

module.exports = CommandRegistry;
