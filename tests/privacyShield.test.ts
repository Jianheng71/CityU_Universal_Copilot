import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSensitiveFieldMeta } from '../src/content/privacyShield';

test('password fields still trip the privacy shield', () => {
  assert.equal(isSensitiveFieldMeta({
    tagName: 'INPUT',
    inputType: 'password',
    ariaLabel: 'password'
  }), true);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'INPUT',
    inputType: 'text',
    name: 'student_pin'
  }), true);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'INPUT',
    inputType: 'text',
    autocomplete: 'current-password'
  }), true);
});

test('Banner hidden fields and menu chrome do not trip the privacy shield', () => {
  assert.equal(isSensitiveFieldMeta({
    tagName: 'INPUT',
    inputType: 'hidden',
    name: 'pin_token'
  }), false);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'DIV',
    id: 'api-key',
    name: 'account'
  }), false);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'A',
    id: 'ChangePinLink'
  }), false);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'INPUT',
    inputType: 'text',
    name: 'keyword'
  }), false);
  assert.equal(isSensitiveFieldMeta({
    tagName: 'DIV',
    id: 'cityu-universal-sinno-shadow-host',
    spotlightHost: true
  }), false);
});
