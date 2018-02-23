/**
 * volumelayer.js
 * @flow
 */

import _ from "lodash";
import Drawing from "libs/drawing";
import Utils from "libs/utils";
import Dimensions from "oxalis/model/dimensions";
import { Vector3Indicies } from "oxalis/constants";
import Store from "oxalis/store";
import { getBaseVoxelFactors } from "oxalis/model/scaleinfo";
import { getPlaneScalingFactor } from "oxalis/model/accessors/flycam_accessor";
import type { OrthoViewType, Vector2, Vector3 } from "oxalis/constants";

export class BitMap {
  offset: Vector2;
  size: Vector2;
  map: Array<Array<boolean>>;

  constructor(offset: Vector2, size: Vector2, initial: boolean = true) {
    this.offset = [Math.floor(offset[0]), Math.floor(offset[1])];
    this.size = size;

    const map = new Array(size[0]);
    for (let x = 0; x < size[0]; x++) {
      map[x] = new Array(size[1]);
      map[x].fill(initial);
    }
    this.map = map;
  }

  get = (x: number, y: number) =>
    this.map[Math.floor(x) - this.offset[0]][Math.floor(y) - this.offset[1]];
  getRelative = (x: number, y: number) => this.map[Math.floor(x)][Math.floor(y)];

  set = (x: number, y: number, value: boolean) => {
    this.map[Math.floor(x) - this.offset[0]][Math.floor(y) - this.offset[1]] = value;
  };
  setTrue = (x: number, y: number) => {
    this.map[Math.floor(x) - this.offset[0]][Math.floor(y) - this.offset[1]] = true;
  };
  setFalse = (x: number, y: number) => {
    this.map[Math.floor(x) - this.offset[0]][Math.floor(y) - this.offset[1]] = false;
  };
}

export class VoxelIterator {
  hasNext: boolean = true;
  map: BitMap;
  x = 0;
  y = 0;
  get3DCoordinate: Vector2 => Vector3;

  static finished(): VoxelIterator {
    const iterator = new VoxelIterator(new BitMap([0, 0], [0, 0]));
    iterator.hasNext = false;
    return iterator;
  }

  constructor(map: BitMap, get3DCoordinate: Vector2 => Vector3 = () => [0, 0, 0]) {
    this.map = map;
    this.get3DCoordinate = get3DCoordinate;
    if (!this.map.getRelative(0, 0)) {
      this.getNext();
    }
  }

  getNext(): Vector3 {
    const res = this.get3DCoordinate([this.x + this.map.offset[0], this.y + this.map.offset[1]]);
    let foundNext = false;
    while (!foundNext) {
      this.x = (this.x + 1) % this.map.size[0];
      if (this.x === 0) {
        this.y++;
      }
      if (this.map.getRelative(this.x, this.y) || this.y === this.map.size[1]) {
        this.hasNext = this.y !== this.map.size[1];
        foundNext = true;
      }
    }
    return res;
  }
}

class VolumeLayer {
  plane: OrthoViewType;
  thirdDimensionValue: number;
  contourList: Array<Vector3>;
  maxCoord: ?Vector3;
  minCoord: ?Vector3;

  constructor(plane: OrthoViewType, thirdDimensionValue: number) {
    this.plane = plane;
    this.thirdDimensionValue = thirdDimensionValue;
    this.maxCoord = null;
    this.minCoord = null;
  }

  addContour(pos: Vector3): void {
    this.updateArea(pos);
  }

  updateArea(pos: Vector3): void {
    let { minCoord, maxCoord } = this;

    if (maxCoord == null || minCoord == null) {
      maxCoord = _.clone(pos);
      minCoord = _.clone(pos);
    }

    for (const i of Vector3Indicies) {
      minCoord[i] = Math.min(minCoord[i], Math.floor(pos[i]) - 2);
      maxCoord[i] = Math.max(maxCoord[i], Math.ceil(pos[i]) + 2);
    }

    this.minCoord = minCoord;
    this.maxCoord = maxCoord;
  }

  getContourList() {
    const volumeTracing = Store.getState().tracing;
    if (volumeTracing.type !== "volume") {
      throw new Error("getContourList must only be called in a volume tracing!");
    } else {
      return volumeTracing.contourList;
    }
  }

  finish(): void {
    if (!this.isEmpty()) {
      this.addContour(this.getContourList()[0]);
    }
  }

  isEmpty(): boolean {
    return this.getContourList().length === 0;
  }

  getVoxelIterator(): VoxelIterator {
    if (this.isEmpty()) {
      return VoxelIterator.finished();
    }

    if (this.minCoord == null) {
      return VoxelIterator.finished();
    }
    const minCoord2d = this.get2DCoordinate(this.minCoord);

    if (this.maxCoord == null) {
      return VoxelIterator.finished();
    }
    const maxCoord2d = this.get2DCoordinate(this.maxCoord);

    const width = maxCoord2d[0] - minCoord2d[0] + 1;
    const height = maxCoord2d[1] - minCoord2d[1] + 1;

    const map = new BitMap(minCoord2d, [width, height], true);

    // The approach is to initialize the map to true, then
    // draw the outline with false, then fill everything
    // outside the cell with false and then repaint the outline
    // with true.
    //
    // Reason:
    // Unless the shape is something like a ring, the area
    // outside the cell will be in one piece, unlike the inner
    // area if you consider narrow shapes.
    // Also, it will be very clear where to start the filling
    // algorithm.
    this.drawOutlineVoxels(map.setFalse);
    this.fillOutsideArea(map);
    this.drawOutlineVoxels(map.setTrue);

    const iterator = new VoxelIterator(map, this.get3DCoordinate.bind(this));
    return iterator;
  }

  getCircleVoxelIterator(position: Vector3): VoxelIterator {
    const radius = this.pixelsToVoxels(Store.getState().temporaryConfiguration.brushSize) / 2;
    const width = Math.ceil(2 * radius + 2);
    const height = width;

    const coord2d = this.get2DCoordinate(position);
    const minCoord2d = [Math.floor(coord2d[0] - radius), Math.floor(coord2d[1] - radius)];
    const map = new BitMap(minCoord2d, [width, height], false);

    // Use the baseVoxelFactors to scale the circle, otherwise it'll become an ellipse
    const baseVoxelFactors = this.get2DCoordinate(
      getBaseVoxelFactors(Store.getState().dataset.scale),
    );
    Drawing.fillCircle(coord2d[0], coord2d[1], radius, baseVoxelFactors, map.setTrue);

    const iterator = new VoxelIterator(map, this.get3DCoordinate.bind(this));
    return iterator;
  }

  drawOutlineVoxels(setMap: (number, number) => void): void {
    const contourList = this.getContourList();
    for (let i = 0; i < contourList.length; i++) {
      const p1 = this.get2DCoordinate(contourList[i]);
      const p2 = this.get2DCoordinate(contourList[(i + 1) % contourList.length]);

      Drawing.drawLine2d(p1[0], p1[1], p2[0], p2[1], setMap);
    }
  }

  fillOutsideArea(map: BitMap): void {
    const isEmpty = map.get;

    // Fill everything BUT the cell
    Drawing.scanlineFloodFill(
      map.offset[0],
      map.offset[1],
      map.size[0],
      map.size[1],
      false,
      isEmpty,
      map.setFalse,
    );
  }

  get2DCoordinate(coord3d: Vector3): Vector2 {
    return Dimensions.translate3Dto2D(coord3d, this.plane);
  }

  get3DCoordinate(coord2d: Vector2): Vector3 {
    return Dimensions.translate2Dto3D(coord2d, this.thirdDimensionValue, this.plane);
  }

  getCentroid(): Vector3 {
    // Formula:
    // https://en.wikipedia.org/wiki/Centroid#Centroid_of_polygon

    let sumArea = 0;
    let sumCx = 0;
    let sumCy = 0;
    for (const i of Utils.__range__(0, this.getContourList().length - 1, false)) {
      const [x, y] = this.get2DCoordinate(this.getContourList()[i]);
      const [x1, y1] = this.get2DCoordinate(this.getContourList()[i + 1]);
      sumArea += x * y1 - x1 * y;
      sumCx += (x + x1) * (x * y1 - x1 * y);
      sumCy += (y + y1) * (x * y1 - x1 * y);
    }

    const area = sumArea / 2;
    const cx = sumCx / 6 / area;
    const cy = sumCy / 6 / area;

    return this.get3DCoordinate([cx, cy]);
  }

  pixelsToVoxels(pixels: number): number {
    const state = Store.getState();
    const zoomFactor = getPlaneScalingFactor(state.flycam);
    const viewportScale = state.userConfiguration.scale;
    return pixels / viewportScale * zoomFactor;
  }
}

export default VolumeLayer;
