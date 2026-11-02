import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDisplayText} from './scanner.js';
test('recognizes labeled measurements',()=>assert.deepEqual(parseDisplayText('TIME 30:29\nDISTANCE 5.42\nCALORIES 310\nWATT 125'),{duration:'30:29',distance:5.42,calories:310,avgWatts:125}));
test('does not guess from unlabeled values',()=>assert.deepEqual(parseDisplayText('30:29\n310\n5.42'),{}));
test('handles decimal comma',()=>assert.equal(parseDisplayText('DISTANZ 4,75').distance,4.75));
