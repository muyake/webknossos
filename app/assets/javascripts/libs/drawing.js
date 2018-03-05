/*
 * drawing.js
 * @flow
 */

import type { Vector3 } from "oxalis/constants";

type RangeItem = [number, number, number, boolean | null, boolean, boolean];

// This is a class with static methods and constants dealing with drawing
// lines and filling polygons

// Macros
// Constants
const SMOOTH_LENGTH = 4;
const SMOOTH_ALPHA = 0.2;

class Drawing {
  alpha: number = SMOOTH_ALPHA;
  smoothLength: number = SMOOTH_LENGTH;

  // Source: http://en.wikipedia.org/wiki/Bresenham's_line_algorithm#Simplification
  drawLine2d(x: number, y: number, x1: number, y1: number, draw: (number, number) => void) {
    x = Math.floor(x);
    y = Math.floor(y);
    x1 = Math.floor(x1);
    y1 = Math.floor(y1);
    let d;
    let mode;
    let dx = x1 - x;
    let dy = y1 - y;
    let incX = dx < 0 ? -1 : 1;
    let incY = dy < 0 ? -1 : 1;

    dx = Math.abs(dx);
    dy = Math.abs(dy);

    let dx2 = dx << 1;
    let dy2 = dy << 1;

    draw(x, y);

    if (dx >= dy) {
      d = dx;
      mode = 0;
    } else {
      // swapMacro(y, x)
      let tmp = y;
      y = x;
      x = tmp;

      // swapMacro(incY, incX)
      tmp = incY;
      incY = incX;
      incX = tmp;

      // swapMacro(dy2, dx2)
      tmp = dy2;
      dy2 = dx2;
      dx2 = tmp;

      d = dy;
      mode = 1;
    }

    let err = dy2 - d;

    for (let i = 0; i < d; i++) {
      if (err > 0) {
        y += incY;
        err -= dx2;
      }

      err += dy2;
      x += incX;

      if (mode) {
        draw(y, x);
      } else {
        draw(x, y);
      }
    }
  }

  addNextLine(
    newY: number,
    isNext: boolean,
    downwards: boolean,
    minX: number,
    maxX: number,
    r: RangeItem,
    ranges: Array<RangeItem>,
    test: (number, number) => boolean,
    paint: (number, number) => void,
  ) {
    let rMinX = minX;
    let inRange = false;
    let x = minX;

    while (x <= maxX) {
      // skip testing, if testing previous line within previous range
      const empty = (isNext || (x < r[0] || x > r[1])) && test(x, newY);
      if (!inRange && empty) {
        rMinX = x;
        inRange = true;
      } else if (inRange && !empty) {
        ranges.push([rMinX, x - 1, newY, downwards, rMinX === minX, false]);
        inRange = false;
      }
      if (inRange) {
        paint(x, newY);
      }

      // skip
      if (!isNext && x === r[0]) {
        x = r[1];
      }
      x++;
    }
    if (inRange) {
      ranges.push([rMinX, x - 1, newY, downwards, rMinX === minX, true]);
    }
  }

  // https://en.wikipedia.org/wiki/Midpoint_circle_algorithm
  fillCircle(
    x0: number,
    y0: number,
    radius: number,
    scale: [number, number],
    drawPixel: (number, number) => void,
  ) {
    x0 = Math.ceil(x0);
    y0 = Math.ceil(y0);
    let x = radius - 1;
    let y = 0;
    let dx = 1;
    let dy = 1;
    // Decision criterion divided by 2 evaluated at x=r, y=0
    let decisionOver2 = dx - (radius << 1);
    while (x >= y) {
      this.drawLine2d(
        -x * scale[0] + x0,
        y * scale[1] + y0,
        x * scale[0] + x0,
        y * scale[1] + y0,
        drawPixel,
      );
      this.drawLine2d(
        -y * scale[0] + x0,
        -x * scale[1] + y0,
        -y * scale[0] + x0,
        x * scale[1] + y0,
        drawPixel,
      );
      this.drawLine2d(
        -x * scale[0] + x0,
        -y * scale[1] + y0,
        x * scale[0] + x0,
        -y * scale[1] + y0,
        drawPixel,
      );
      this.drawLine2d(
        y * scale[0] + x0,
        -x * scale[1] + y0,
        y * scale[0] + x0,
        x * scale[1] + y0,
        drawPixel,
      );
      if (decisionOver2 <= 0) {
        y++;
        // Change in decision criterion for y -> y+1
        decisionOver2 += dy;
        dy += 2;
      }
      if (decisionOver2 > 0) {
        x--;
        dx += 2;
        // Change for y -> y+1, x -> x-1
        decisionOver2 += (-radius << 1) + dx;
      }
    }
  }

  fillCircleExact(
    x0: number,
    y0: number,
    radius: number,
    scale: [number, number],
    drawPixel: (number, number) => void,
    map: BitMap,
  ) {
    function pointInCircle(x, y) {
      const dx = (x - x0) * scale[0];
      const dy = (y - y0) * scale[1];
      return Math.sqrt(dx * dx + dy * dy) < radius;
    }
    for (let x = map.offset[0]; x < map.offset[0] + map.size[0]; x++) {
      for (let y = map.offset[1]; y < map.offset[1] + map.size[1]; y++) {
        if (pointInCircle(x, y) || pointInCircle(x + 1, y) || pointInCircle(x, y + 1) || pointInCircle(x + 1, y + 1)) {
          drawPixel(x, y);
        }
      }
    }
  }

  // Source: http://will.thimbleby.net/scanline-flood-fill/
  scanlineFloodFill(
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    diagonal: boolean,
    test: (number, number) => boolean,
    paint: (number, number) => void,
  ) {
    const x = offsetX;
    let y = offsetY;
    const extentX = offsetX + width;
    const extentY = offsetY + height;

    // xMin, xMax, y, down[true] / up[false], extendLeft, extendRight
    const ranges: Array<RangeItem> = [[x, x, y, null, true, true]];
    paint(x, y);
    while (ranges.length) {
      const r = ranges.pop();
      let minX = r[0];
      let maxX = r[1];
      y = r[2];
      const down = r[3] === true;
      const up = r[3] === false;
      const extendLeft = r[4];
      const extendRight = r[5];
      if (extendLeft) {
        while (minX > offsetX && test(minX - 1, y)) {
          minX--;
          paint(minX, y);
        }
      }
      if (extendRight) {
        while (maxX < extentX - 1 && test(maxX + 1, y)) {
          maxX++;
          paint(maxX, y);
        }
      }
      if (diagonal) {
        if (minX > offsetX) {
          minX--;
        }
        if (maxX < extentX - 1) {
          maxX++;
        }
      } else {
        r[0]--;
        r[1]++;
      }
      if (y < extentY) {
        this.addNextLine(y + 1, !up, true, minX, maxX, r, ranges, test, paint);
      }
      if (y > offsetY) {
        this.addNextLine(y - 1, !down, false, minX, maxX, r, ranges, test, paint);
      }
    }
  }

  // Source : http://twistedoakstudios.com/blog/Post3138_mouse-path-smoothing-for-jack-lumber
  smoothLine(points: Array<Vector3>, callback: Vector3 => void): Array<Vector3> {
    const smoothLength = this.smoothLength || SMOOTH_LENGTH;
    const a = this.alpha || SMOOTH_ALPHA;

    if (points.length > 2 + smoothLength) {
      for (let i = 0; i < smoothLength; i++) {
        const j = points.length - i - 2;
        const p0 = points[j];
        const p1 = points[j + 1];

        const p = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          p[k] = p0[k] * (1 - a) + p1[k] * a;
        }

        callback(p);
        points[j] = p;
      }
    }

    return points;
  }

  setSmoothLength(v: number): void {
    this.smoothLength = v;
  }

  setAlpha(v: number): void {
    this.alpha = v;
  }
}

export default new Drawing();
