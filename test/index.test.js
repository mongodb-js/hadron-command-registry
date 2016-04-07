/* eslint one-var: 1, no-unused-expressions: 1 */

var CommandRegistry = require('../');
var _ = require('underscore-plus');

var chai = require('chai');
var spies = require('chai-spies');

chai.use(spies);

var expect = chai.expect;

describe('CommandRegistry', function() {
  var child, grandchild, parent, registry;
  var ref = [], registry = ref[0], parent = ref[1], child = ref[2], grandchild = ref[3];
  beforeEach(function() {
    parent = document.createElement('div');
    child = document.createElement('div');
    grandchild = document.createElement('div');
    parent.classList.add('parent');
    child.classList.add('child');
    grandchild.classList.add('grandchild');
    child.appendChild(grandchild);
    parent.appendChild(child);

    var testContent = document.createElement('div');
    testContent.id = 'test-content';
    document.querySelector('body').appendChild(testContent);
    document.querySelector('#test-content').appendChild(parent);
    registry = new CommandRegistry;
    return registry.attach(parent);
  });
  afterEach(function() {
    return registry.destroy();
  });
  describe('when a command event is dispatched on an element', function() {
    it('invokes callbacks with selectors matching the target', function() {
      var called;
      called = false;
      registry.add('.grandchild', 'command', function(event) {
        expect(this).to.deep.equal(grandchild);
        expect(event.type).to.deep.equal('command');
        expect(event.eventPhase).to.deep.equal(Event.BUBBLING_PHASE);
        expect(event.target).to.deep.equal(grandchild);
        expect(event.currentTarget).to.deep.equal(grandchild);
        called = true;
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      return expect(called).to.deep.equal(true);
    });
    it('invokes callbacks with selectors matching ancestors of the target', function() {
      var calls;
      calls = [];
      registry.add('.child', 'command', function(event) {
        expect(this).to.deep.equal(child);
        expect(event.target).to.deep.equal(grandchild);
        expect(event.currentTarget).to.deep.equal(child);
        return calls.push('child');
      });
      registry.add('.parent', 'command', function(event) {
        expect(this).to.deep.equal(parent);
        expect(event.target).to.deep.equal(grandchild);
        expect(event.currentTarget).to.deep.equal(parent);
        return calls.push('parent');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      return expect(calls).to.deep.equal(['child', 'parent']);
    });
    it('invokes inline listeners prior to listeners applied via selectors', function() {
      var calls;
      calls = [];
      registry.add('.grandchild', 'command', function() {
        return calls.push('grandchild');
      });
      registry.add(child, 'command', function() {
        return calls.push('child-inline');
      });
      registry.add('.child', 'command', function() {
        return calls.push('child');
      });
      registry.add('.parent', 'command', function() {
        return calls.push('parent');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      return expect(calls).to.deep.equal(['grandchild', 'child-inline', 'child', 'parent']);
    });
    it('orders multiple matching listeners for an element by selector specificity', function() {
      var calls;
      child.classList.add('foo', 'bar');
      calls = [];
      registry.add('.foo.bar', 'command', function() {
        return calls.push('.foo.bar');
      });
      registry.add('.foo', 'command', function() {
        return calls.push('.foo');
      });
      registry.add('.bar', 'command', function() {
        return calls.push('.bar');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      return expect(calls).to.deep.equal(['.foo.bar', '.bar', '.foo']);
    });
    it('stops bubbling through ancestors when .stopPropagation() is called on the event', function() {
      var calls, dispatchedEvent;
      calls = [];
      registry.add('.parent', 'command', function() {
        return calls.push('parent');
      });
      registry.add('.child', 'command', function() {
        return calls.push('child-2');
      });
      registry.add('.child', 'command', function(event) {
        calls.push('child-1');
        return event.stopPropagation();
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      var spy = chai.spy.on(dispatchedEvent, 'stopPropagation');
      grandchild.dispatchEvent(dispatchedEvent);
      expect(calls).to.deep.equal(['child-1', 'child-2']);
      return expect(spy).to.have.been.called();
    });
    it('stops invoking callbacks when .stopImmediatePropagation() is called on the event', function() {
      var calls, dispatchedEvent;
      calls = [];
      registry.add('.parent', 'command', function() {
        return calls.push('parent');
      });
      registry.add('.child', 'command', function() {
        return calls.push('child-2');
      });
      registry.add('.child', 'command', function(event) {
        calls.push('child-1');
        return event.stopImmediatePropagation();
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      var spy = chai.spy.on(dispatchedEvent, 'stopImmediatePropagation');
      grandchild.dispatchEvent(dispatchedEvent);
      expect(calls).to.deep.equal(['child-1']);
      expect(spy).to.have.been.called();
    });
    it('forwards .preventDefault() calls from the synthetic event to the original', function() {
      var dispatchedEvent;
      registry.add('.child', 'command', function(event) {
        return event.preventDefault();
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      var spy = chai.spy.on(dispatchedEvent, 'preventDefault');
      grandchild.dispatchEvent(dispatchedEvent);
      expect(spy).to.have.been.called();
    });
    it('forwards .abortKeyBinding() calls from the synthetic event to the original', function() {
      var dispatchedEvent;
      registry.add('.child', 'command', function(event) {
        return event.abortKeyBinding();
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      dispatchedEvent.abortKeyBinding = chai.spy('abortKeyBinding');
      grandchild.dispatchEvent(dispatchedEvent);
      return expect(dispatchedEvent.abortKeyBinding).to.have.been.called();
    });
    it('copies non-standard properties from the original event to the synthetic event', function() {
      var dispatchedEvent, syntheticEvent;
      syntheticEvent = null;
      registry.add('.child', 'command', function(event) {
        syntheticEvent = event;
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      dispatchedEvent.nonStandardProperty = 'testing';
      grandchild.dispatchEvent(dispatchedEvent);
      expect(syntheticEvent.nonStandardProperty).to.deep.equal('testing');
    });
    it('allows listeners to be removed via a disposable returned by ::add', function() {
      var calls, disposable1, disposable2;
      calls = [];
      disposable1 = registry.add('.parent', 'command', function() {
        return calls.push('parent');
      });
      disposable2 = registry.add('.child', 'command', function() {
        return calls.push('child');
      });
      disposable1.dispose();
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      expect(calls).to.deep.equal(['child']);
      calls = [];
      disposable2.dispose();
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      return expect(calls).to.deep.equal([]);
    });
    it('allows multiple commands to be registered under one selector when called with an object', function() {
      var calls, disposable;
      calls = [];
      disposable = registry.add('.child', {
        'command-1': function() {
          return calls.push('command-1');
        },
        'command-2': function() {
          return calls.push('command-2');
        }
      });
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      grandchild.dispatchEvent(new CustomEvent('command-2', {
        bubbles: true
      }));
      expect(calls).to.deep.equal(['command-1', 'command-2']);
      calls = [];
      disposable.dispose();
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      grandchild.dispatchEvent(new CustomEvent('command-2', {
        bubbles: true
      }));
      return expect(calls).to.deep.equal([]);
    });
    return it('invokes callbacks registered with ::onWillDispatch and ::onDidDispatch', function() {
      var ref1, sequence;
      sequence = [];
      registry.onDidDispatch(function(event) {
        return sequence.push(['onDidDispatch', event]);
      });
      registry.add('.grandchild', 'command', function(event) {
        return sequence.push(['listener', event]);
      });
      registry.onWillDispatch(function(event) {
        return sequence.push(['onWillDispatch', event]);
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      expect(sequence[0][0]).to.deep.equal('onWillDispatch');
      expect(sequence[1][0]).to.deep.equal('listener');
      expect(sequence[2][0]).to.deep.equal('onDidDispatch');
      expect((sequence[0][1] === (ref1 = sequence[1][1]) && ref1 === sequence[2][1])).to.deep.equal(true);
      expect(sequence[0][1].constructor).to.deep.equal(CustomEvent);
      return expect(sequence[0][1].target).to.deep.equal(grandchild);
    });
  });
  describe('::add(selector, commandName, callback)', function() {
    it('throws an error when called with an invalid selector', function() {
      var addError, badSelector, error;
      badSelector = '<>';
      addError = null;
      try {
        registry.add(badSelector, 'foo:bar', function() {});
      } catch (_error) {
        error = _error;
        addError = error;
      }
      return expect(addError.message).to.contain(badSelector);
    });
    it('throws an error when called with a non-function callback and selector target', function() {
      var addError, badCallback, error;
      badCallback = null;
      addError = null;
      try {
        registry.add('.selector', 'foo:bar', badCallback);
      } catch (_error) {
        error = _error;
        addError = error;
      }
      return expect(addError.message).to.contain('Can\'t register a command with non-function callback.');
    });
    return it('throws an error when called with an non-function callback and object target', function() {
      var addError, badCallback, error;
      badCallback = null;
      addError = null;
      try {
        registry.add(document.body, 'foo:bar', badCallback);
      } catch (_error) {
        error = _error;
        addError = error;
      }
      return expect(addError.message).to.contain('Can\'t register a command with non-function callback.');
    });
  });
  describe('::findCommands({target})', function() {
    return it('returns commands that can be invoked on the target or its ancestors', function() {
      var commands, nonJqueryCommands;
      registry.add('.parent', 'namespace:command-1', function() {});
      registry.add('.child', 'namespace:command-2', function() {});
      registry.add('.grandchild', 'namespace:command-3', function() {});
      registry.add('.grandchild.no-match', 'namespace:command-4', function() {});
      registry.add(grandchild, 'namespace:inline-command-1', function() {});
      registry.add(child, 'namespace:inline-command-2', function() {});
      commands = registry.findCommands({
        target: grandchild
      });
      nonJqueryCommands = _.reject(commands, function(cmd) {
        return cmd.jQuery;
      });
      return expect(nonJqueryCommands).to.deep.equal([
        {
          name: 'namespace:inline-command-1',
          displayName: 'Namespace: Inline Command 1'
        }, {
          name: 'namespace:command-3',
          displayName: 'Namespace: Command 3'
        }, {
          name: 'namespace:inline-command-2',
          displayName: 'Namespace: Inline Command 2'
        }, {
          name: 'namespace:command-2',
          displayName: 'Namespace: Command 2'
        }, {
          name: 'namespace:command-1',
          displayName: 'Namespace: Command 1'
        }
      ]);
    });
  });
  describe('::dispatch(target, commandName)', function() {
    it('simulates invocation of the given command ', function() {
      var called;
      called = false;
      registry.add('.grandchild', 'command', function(event) {
        expect(this).to.deep.equal(grandchild);
        expect(event.type).to.deep.equal('command');
        expect(event.eventPhase).to.deep.equal(Event.BUBBLING_PHASE);
        expect(event.target).to.deep.equal(grandchild);
        expect(event.currentTarget).to.deep.equal(grandchild);
        called = true;
      });
      registry.dispatch(grandchild, 'command');
      return expect(called).to.deep.equal(true);
    });
    return it('returns a boolean indicating whether any listeners matched the command', function() {
      registry.add('.grandchild', 'command', function() {});
      expect(registry.dispatch(grandchild, 'command')).to.deep.equal(true);
      expect(registry.dispatch(grandchild, 'bogus')).to.deep.equal(false);
      return expect(registry.dispatch(parent, 'command')).to.deep.equal(false);
    });
  });
  describe('::getSnapshot and ::restoreSnapshot', function() {
    return it('removes all command handlers except for those in the snapshot', function() {
      var snapshot;
      registry.add('.parent', 'namespace:command-1', function() {});
      registry.add('.child', 'namespace:command-2', function() {});
      snapshot = registry.getSnapshot();
      registry.add('.grandchild', 'namespace:command-3', function() {});
      expect(registry.findCommands({
        target: grandchild
      }).slice(0, 3)).to.deep.equal([
        {
          name: 'namespace:command-3',
          displayName: 'Namespace: Command 3'
        }, {
          name: 'namespace:command-2',
          displayName: 'Namespace: Command 2'
        }, {
          name: 'namespace:command-1',
          displayName: 'Namespace: Command 1'
        }
      ]);
      registry.restoreSnapshot(snapshot);
      expect(registry.findCommands({
        target: grandchild
      }).slice(0, 2)).to.deep.equal([
        {
          name: 'namespace:command-2',
          displayName: 'Namespace: Command 2'
        }, {
          name: 'namespace:command-1',
          displayName: 'Namespace: Command 1'
        }
      ]);
      registry.add('.grandchild', 'namespace:command-3', function() {});
      registry.restoreSnapshot(snapshot);
      return expect(registry.findCommands({
        target: grandchild
      }).slice(0, 2)).to.deep.equal([
        {
          name: 'namespace:command-2',
          displayName: 'Namespace: Command 2'
        }, {
          name: 'namespace:command-1',
          displayName: 'Namespace: Command 1'
        }
      ]);
    });
  });
  return describe('::attach(rootNode)', function() {
    return it('adds event listeners for any previously-added commands', function() {
      var registry2 = new CommandRegistry;
      var commandSpy = chai.spy('command-callback');
      registry2.add('.grandchild', 'command-1', commandSpy);
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      expect(commandSpy).not.to.have.been.called();
      registry2.attach(parent);
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      return expect(commandSpy).to.have.been.called();
    });
  });
});
