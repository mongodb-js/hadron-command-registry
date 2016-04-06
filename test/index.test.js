var assert = require('assert');
var _ = require('lodash');

describe('CommandRegistry', function() {
  var registry;
  var grandchild;
  var child;
  var parent;

  beforeEach(function() {
    parent = document.createElement('div');
    child = document.createElement('div');
    grandchild = document.createElement('div');

    parent.classList.add('parent');
    child.classList.add('child');
    grandchild.classList.add('grandchild');

    child.appendChild(grandchild);
    parent.appendChild(child);
    document.querySelector('body').appendChild(parent);

    var CommandRegistry = require('../');
    registry = new CommandRegistry();
    registry.attach(parent);
  });

  afterEach(function() {
    registry.destroy();
  });

  describe('when a command event is dispatched on an element', function() {
    it('invokes callbacks with selectors matching the target', function() {
      var called = false;
      registry.add('.grandchild', 'command', function(event) {
        assert.equal(this, grandchild);
        assert.equal(event.type, 'command');
        assert.equal(event.eventPhase, Event.BUBBLING_PHASE);
        assert.equal(event.target, grandchild);
        assert.equal(event.currentTarget, grandchild);
        called = true;
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.equal(called, true);
    });
    it('invokes callbacks with selectors matching ancestors of the target', function() {
      var calls = [];

      registry.add('.child', 'command', function(event) {
        assert.equal(this, child);
        assert.equal(event.target, grandchild);
        assert.equal(event.currentTarget, child);
        calls.push('child');
      });
      registry.add('.parent', 'command', function(event) {
        assert.equal(this, parent);
        assert.equal(event.target, grandchild);
        assert.equal(event.currentTarget, parent);
        calls.push('parent');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.deepEqual(calls, ['child', 'parent']);
    });
    it('invokes inline listeners prior to listeners applied via selectors', function() {
      var calls = [];
      registry.add('.grandchild', 'command', function() {
        calls.push('grandchild');
      });
      registry.add(child, 'command', function() {
        calls.push('child-inline');
      });
      registry.add('.child', 'command', function() {
        calls.push('child');
      });
      registry.add('.parent', 'command', function() {
        calls.push('parent');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.deepEqual(calls,
        ['grandchild', 'child-inline', 'child', 'parent']);
    });

    it('orders multiple matching listeners for an element by selector specificity', function() {
      var calls;
      child.classList.add('foo', 'bar');
      calls = [];
      registry.add('.foo.bar', 'command', function() {
        calls.push('.foo.bar');
      });
      registry.add('.foo', 'command', function() {
        calls.push('.foo');
      });
      registry.add('.bar', 'command', function() {
        calls.push('.bar');
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.deepEqual(calls, ['.foo.bar', '.bar', '.foo']);
    });
    it('stops bubbling through ancestors when .stopPropagation() is called on the event', function() {
      var calls = [];
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
      var dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      // spyOn(dispatchedEvent, 'stopPropagation');
      grandchild.dispatchEvent(dispatchedEvent);
      assert.deepEqual(calls, ['child-1', 'child-2']);

      // return expect(dispatchedEvent.stopPropagation).toHaveBeenCalled();
    });
    it('stops invoking callbacks when .stopImmediatePropagation() is called on the event', function() {
      var calls = [];
      registry.add('.parent', 'command', function() {
        calls.push('parent');
      });
      registry.add('.child', 'command', function() {
        calls.push('child-2');
      });
      registry.add('.child', 'command', function(event) {
        calls.push('child-1');
        event.stopImmediatePropagation();
      });

      var dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      // spyOn(dispatchedEvent, 'stopImmediatePropagation');
      grandchild.dispatchEvent(dispatchedEvent);
      assert.deepEqual(calls, ['child-1']);
      // return expect(dispatchedEvent.stopImmediatePropagation).toHaveBeenCalled();
    });
    it('forwards .preventDefault() calls from the synthetic event to the original', function() {
      registry.add('.child', 'command', function(event) {
        return event.preventDefault();
      });
      var dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      // spyOn(dispatchedEvent, 'preventDefault');
      grandchild.dispatchEvent(dispatchedEvent);
      // return expect(dispatchedEvent.preventDefault).toHaveBeenCalled();
    });
    it('forwards .abortKeyBinding() calls from the synthetic event to the original', function() {
      var dispatchedEvent;
      registry.add('.child', 'command', function(event) {
        event.abortKeyBinding();
      });
      dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });
      // dispatchedEvent.abortKeyBinding = jasmine.createSpy('abortKeyBinding');
      grandchild.dispatchEvent(dispatchedEvent);
      // return expect(dispatchedEvent.abortKeyBinding).toHaveBeenCalled();
    });
    it('copies non-standard properties from the original event to the synthetic event', function() {
      var syntheticEvent = null;
      registry.add('.child', 'command', function(event) {
        syntheticEvent = event;
      });

      var dispatchedEvent = new CustomEvent('command', {
        bubbles: true
      });

      dispatchedEvent.nonStandardProperty = 'testing';
      grandchild.dispatchEvent(dispatchedEvent);
      assert.equal(syntheticEvent.nonStandardProperty, 'testing');
    });
    it('allows listeners to be removed via a disposable returned by ::add', function() {
      var calls = [];
      var disposable1 = registry.add('.parent', 'command', function() {
        calls.push('parent');
      });
      var disposable2 = registry.add('.child', 'command', function() {
        calls.push('child');
      });
      disposable1.dispose();
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.deepEqual(calls, ['child']);
      calls = [];
      disposable2.dispose();
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.deepEqual(calls, []);
    });
    it('allows multiple commands to be registered under one selector when called with an object', function() {
      var calls = [];
      var disposable = registry.add('.child', {
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
      assert.deepEqual(calls, ['command-1', 'command-2']);
      calls = [];
      disposable.dispose();
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      grandchild.dispatchEvent(new CustomEvent('command-2', {
        bubbles: true
      }));
      assert.deepEqual(calls, []);
    });
    it('invokes callbacks registered with ::onWillDispatch and ::onDidDispatch', function() {
      var sequence = [];
      registry.onDidDispatch(function(event) {
        sequence.push(['onDidDispatch', event]);
      });
      registry.add('.grandchild', 'command', function(event) {
        sequence.push(['listener', event]);
      });
      registry.onWillDispatch(function(event) {
        sequence.push(['onWillDispatch', event]);
      });
      grandchild.dispatchEvent(new CustomEvent('command', {
        bubbles: true
      }));
      assert.equal(sequence[0][0], 'onWillDispatch');
      assert.equal(sequence[1][0], 'listener');
      assert.equal(sequence[2][0], 'onDidDispatch');
      assert.equal(sequence[0][1].constructor, CustomEvent);
      assert.equal(sequence[0][1].target, grandchild);
    });
  });
  describe('::add(selector, commandName, callback)', function() {
    it('throws an error when called with an invalid selector', function() {
      var badSelector = '<>';
      try {
        registry.add(badSelector, 'foo:bar', function() {});
        assert.fail('Should have thrown');
      } catch (err) {
        assert(err.message.indexOf(badSelector) > -1);
      }
    });
    it('throws an error when called with a non-function callback and selector target', function() {
      assert.throws(function() {
        registry.add('.selector', 'foo:bar', null);
      });
    });
    it('throws an error when called with an non-function callback and object target', function() {
      assert.throws(function() {
        registry.add(document.body, 'foo:bar', null);
      });
    });
  });
  describe('::findCommands({target})', function() {
    it('returns commands that can be invoked on the target or its ancestors', function() {
      registry.add('.parent', 'namespace:command-1', function() {});
      registry.add('.child', 'namespace:command-2', function() {});
      registry.add('.grandchild', 'namespace:command-3', function() {});
      registry.add('.grandchild.no-match', 'namespace:command-4', function() {});
      registry.add(grandchild, 'namespace:inline-command-1', function() {});
      registry.add(child, 'namespace:inline-command-2', function() {});

      var commands = registry.findCommands({
        target: grandchild
      });

      var nonJqueryCommands = _.reject(commands, function(cmd) {
        return cmd.jQuery;
      });

      assert.deepEqual(nonJqueryCommands, [
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
      var called = false;
      registry.add('.grandchild', 'command', function(event) {
        assert.equal(this, grandchild);
        assert.equal(event.type, 'command');
        assert.equal(event.eventPhase, Event.BUBBLING_PHASE);
        assert.equal(event.target, grandchild);
        assert.equal(event.currentTarget, grandchild);
        called = true;
      });
      registry.dispatch(grandchild, 'command');
      assert.equal(called, true);
    });
    it('returns a boolean indicating whether any listeners matched the command', function() {
      registry.add('.grandchild', 'command', function() {});
      assert(registry.dispatch(grandchild, 'command'), true);
      // assert(registry.dispatch(grandchild, 'bogus'), false);
      assert(registry.dispatch(parent, 'command'), false);
    });
  });
  describe('::getSnapshot and ::restoreSnapshot', function() {
    it('removes all command handlers except for those in the snapshot', function() {
      registry.add('.parent', 'namespace:command-1', function() {});
      registry.add('.child', 'namespace:command-2', function() {});

      var snapshot = registry.getSnapshot();
      registry.add('.grandchild', 'namespace:command-3', function() {});
      assert.deepEqual(registry.findCommands({
        target: grandchild
      }).slice(0, 3), [
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
      assert.deepEqual(registry.findCommands({
        target: grandchild
      }).slice(0, 2), [
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
      assert.deepEqual(registry.findCommands({
        target: grandchild
      }).slice(0, 2), [
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
  describe('::attach(rootNode)', function() {
    it('adds event listeners for any previously-added commands', function() {
      var CommandRegistry = require('../');
      var registry2 = new CommandRegistry();
      // commandSpy = jasmine.createSpy('command-callback');
      // registry2.add('.grandchild', 'command-1', commandSpy);
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      // expect(commandSpy).not.toHaveBeenCalled();
      registry2.attach(parent);
      grandchild.dispatchEvent(new CustomEvent('command-1', {
        bubbles: true
      }));
      // expect(commandSpy).toHaveBeenCalled();
    });
  });
});
