// @flow

import test from "ava";
import { BitMap } from "oxalis/model/volumetracing/volumelayer";
import Drawing from "libs/drawing";

function stringifyBitMap(bitMap) {
  return bitMap.map.map(row => row.map(a => (a ? "X" : "_")).join("")).join("\n");
}

test("Empty BitMap should be empty", t => {
  const map = new BitMap([0, 0], [0, 0]);
  t.deepEqual(map.map, []);
  t.deepEqual(map.offset, [0, 0]);
  t.deepEqual(map.size, [0, 0]);
});

test("Should draw one-point line", t => {
  const bitMap = new BitMap([0, 0], [10, 10], false);
  Drawing.drawLine2d(5.3, 5.3, 5.6, 5.6, bitMap.setTrue);
  t.is(
    stringifyBitMap(bitMap),
    `__________
__________
__________
__________
__________
_____X____
__________
__________
__________
__________`,
  );
});

test("Should draw line", t => {
  const bitMap = new BitMap([0, 0], [10, 10], false);
  Drawing.drawLine2d(5.3, 5.3, 8, 8, bitMap.setTrue);
  t.is(
    stringifyBitMap(bitMap),
    `__________
__________
__________
__________
__________
_____X____
______X___
_______X__
________X_
__________`,
  );
});

test("Should draw line with offset", t => {
  const offset = 50;
  const bitMap = new BitMap([offset, offset], [10, 10], false);
  Drawing.drawLine2d(offset + 5.3, offset + 5.3, offset + 8, offset + 8, bitMap.setTrue);

  const bitMap2 = new BitMap([0, 0], [10, 10], false);
  Drawing.drawLine2d(5.3, 5.3, 8, 8, bitMap2.setTrue);

  t.deepEqual(bitMap.map, bitMap2.map);
});

test("Should floodfill area", t => {
  const bitMap = new BitMap([0, 0], [10, 10], true);

  Drawing.drawLine2d(3, 3, 3, 5, bitMap.setFalse);
  Drawing.drawLine2d(3, 5, 5, 5, bitMap.setFalse);
  Drawing.drawLine2d(5, 5, 5, 3, bitMap.setFalse);
  Drawing.drawLine2d(5, 3, 3, 3, bitMap.setFalse);
  t.is(
    stringifyBitMap(bitMap),
    `XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX
XXX___XXXX
XXX_X_XXXX
XXX___XXXX
XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX`,
  );

  Drawing.scanlineFloodFill(0, 0, 10, 10, false, bitMap.get, bitMap.setFalse);
  t.is(
    stringifyBitMap(bitMap),
    `__________
__________
__________
__________
____X_____
__________
__________
__________
__________
__________`,
  );
});

test("Should floodfill area with offset", t => {
  const offset = 50;
  const bitMap = new BitMap([offset, offset], [10, 10], true);

  Drawing.drawLine2d(offset + 3, offset + 3, offset + 3, offset + 5, bitMap.setFalse);
  Drawing.drawLine2d(offset + 3, offset + 5, offset + 5, offset + 5, bitMap.setFalse);
  Drawing.drawLine2d(offset + 5, offset + 5, offset + 5, offset + 3, bitMap.setFalse);
  Drawing.drawLine2d(offset + 5, offset + 3, offset + 3, offset + 3, bitMap.setFalse);
  t.is(
    stringifyBitMap(bitMap),
    `XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX
XXX___XXXX
XXX_X_XXXX
XXX___XXXX
XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX
XXXXXXXXXX`,
  );

  Drawing.scanlineFloodFill(offset, offset, 10, 10, false, bitMap.get, bitMap.setFalse);
  t.is(
    stringifyBitMap(bitMap),
    `__________
__________
__________
__________
____X_____
__________
__________
__________
__________
__________`,
  );
});
