/**
 * binary.js
 * @flow
 */

import _ from "lodash";
import BackboneEvents from "backbone-events-standalone";
import Store from "oxalis/store";
import type { CategoryType } from "oxalis/store";
import AsyncTaskQueue from "libs/async_task_queue";
import InterpolationCollector from "oxalis/model/binary/interpolation_collector";
import DataCube from "oxalis/model/binary/data_cube";
import PullQueue, { PullQueueConstants } from "oxalis/model/binary/pullqueue";
import PushQueue from "oxalis/model/binary/pushqueue";
import {
  PingStrategy,
  SkeletonPingStrategy,
  VolumePingStrategy,
} from "oxalis/model/binary/ping_strategy";
import { PingStrategy3d, DslSlowPingStrategy3d } from "oxalis/model/binary/ping_strategy_3d";
import Mappings from "oxalis/model/binary/mappings";
import constants, { OrthoViewValuesWithoutTDView } from "oxalis/constants";
import ConnectionInfo from "oxalis/model/binarydata_connection_info";
import { listenToStoreProperty } from "oxalis/model/helpers/listener_helpers";
import TextureBucketManager from "oxalis/model/binary/texture_bucket_manager";
import { getPosition } from "oxalis/model/accessors/flycam_accessor";
import Dimensions from "oxalis/model/dimensions";
import shaderEditor from "oxalis/model/helpers/shader_editor";
import { getRenderer } from "oxalis/controller/renderer";

import type { Vector3, Vector4, OrthoViewType } from "oxalis/constants";
import type { Matrix4x4 } from "libs/mjs";
import type Layer from "oxalis/model/binary/layers/layer";

const PING_THROTTLE_TIME = 50;
const DIRECTION_VECTOR_SMOOTHER = 0.125;

type PingOptions = {
  zoomStep: number,
  activePlane: OrthoViewType,
};

// TODO: Non-reactive
class Binary {
  cube: DataCube;
  tracingType: string;
  layer: Layer;
  category: CategoryType;
  name: string;
  targetBitDepth: number;
  lowerBoundary: Vector3;
  upperBoundary: Vector3;
  connectionInfo: ConnectionInfo;
  pullQueue: PullQueue;
  pushQueue: PushQueue;
  mappings: Mappings;
  pingStrategies: Array<PingStrategy>;
  pingStrategies3d: Array<PingStrategy3d>;
  direction: Vector3;
  activeMapping: ?string;
  lastPosition: ?Vector3;
  lastZoomStep: ?number;
  textureBucketManager: TextureBucketManager;

  // Copied from backbone events (TODO: handle this better)
  listenTo: Function;

  constructor(layer: Layer, maxZoomStep: number, connectionInfo: ConnectionInfo) {
    this.tracingType = Store.getState().tracing.type;
    this.layer = layer;
    this.connectionInfo = connectionInfo;
    _.extend(this, BackboneEvents);

    this.category = this.layer.category;
    this.name = this.layer.name;

    this.targetBitDepth = this.category === "color" ? this.layer.bitDepth : 8;

    const { topLeft, width, height, depth } = this.layer.boundingBox;
    this.lowerBoundary = topLeft;
    this.layer.lowerBoundary = topLeft;
    this.upperBoundary = [topLeft[0] + width, topLeft[1] + height, topLeft[2] + depth];
    this.layer.upperBoundary = this.upperBoundary;

    this.cube = new DataCube(this.upperBoundary, maxZoomStep + 1, this.layer.bitDepth, this.layer);

    const taskQueue = new AsyncTaskQueue(Infinity);

    const dataset = Store.getState().dataset;
    if (dataset == null) {
      throw new Error("Dataset needs to be available before constructing the Binary.");
    }
    const datastoreInfo = dataset.dataStore;
    this.pullQueue = new PullQueue(this.cube, this.layer, this.connectionInfo, datastoreInfo);
    this.pushQueue = new PushQueue(this.cube, this.layer, taskQueue);
    this.cube.initializeWithQueues(this.pullQueue, this.pushQueue);
    this.mappings = new Mappings(datastoreInfo, this.layer);
    this.activeMapping = null;
    this.direction = [0, 0, 0];

    this.pingStrategies = [new SkeletonPingStrategy(this.cube), new VolumePingStrategy(this.cube)];
    this.pingStrategies3d = [new DslSlowPingStrategy3d(this.cube)];

    if (this.layer.dataStoreInfo.typ === "webknossos-store") {
      listenToStoreProperty(
        state => state.datasetConfiguration.fourBit,
        fourBit => this.layer.setFourBit(fourBit),
        true,
      );
    }

    // todo
    // this.cube.on({
    //   newMapping: () => ,
    // });
  }

  getTextureSize(): number {
    // return 4096;
    const gl = getRenderer().getContext();
    return gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // return gl.MAX_TEXTURE_SIZE;
  }

  setupDataTextures(): void {
    const bytes = this.layer.bitDepth >> 3;

    const textureWidth = this.getTextureSize();
    const gl = getRenderer().getContext();
    const maxTextureCount = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
    const textureCount = textureWidth < 8192 ? 2 : 1;
    if (textureCount > maxTextureCount) {
      throw new Error("Cannot allocate enough textures");
    }

    this.textureBucketManager = new TextureBucketManager(
      constants.RENDERED_BUCKETS_PER_DIMENSION,
      textureWidth,
      textureCount,
    );
    this.textureBucketManager.setupDataTextures(bytes, this.category);

    shaderEditor.addBucketManagers(this.textureBucketManager);
  }

  getDataTextures(): Array<*> {
    if (!this.textureBucketManager) {
      // Initialize lazily since SceneController.renderer is not available earlier
      this.setupDataTextures();
    }
    return this.textureBucketManager.getTextures();
  }

  updateDataTextures(position: Vector3, logZoomStep: number): [?Vector3, ?Vector3] {
    return [
      this.updateDataTexturesForManager(position, logZoomStep, this.textureBucketManager),
      null,
    ];

    // todo: update fallback buckets
    // const fallbackZoomStep = Math.min(this.cube.MAX_ZOOM_STEP, logZoomStep + 1);
    // return this.updateDataTexturesForManager(
    //   position,
    //   fallbackZoomStep,
    //   this.fallbackTextureBucketManager,
    // );
  }

  updateDataTexturesForManager(
    position: Vector3,
    logZoomStep: number,
    textureBucketManager: TextureBucketManager,
  ): ?Vector3 {
    const resolution = this.layer.resolutions[logZoomStep];

    // Hit texture top-left coordinate
    const anchorPoint = _.clone(position);
    anchorPoint[0] = Math.floor(anchorPoint[0] - constants.PLANE_WIDTH / 2 * resolution[0]);
    anchorPoint[1] = Math.floor(anchorPoint[1] - constants.PLANE_WIDTH / 2 * resolution[1]);
    anchorPoint[2] = Math.floor(anchorPoint[2] - constants.PLANE_WIDTH / 2 * resolution[2]);

    const zoomedAnchorPoint = this.cube.positionToZoomedAddress(anchorPoint, logZoomStep);
    if (_.isEqual(zoomedAnchorPoint, textureBucketManager.lastZoomedAnchorPoint)) {
      return null;
    }

    textureBucketManager.lastZoomedAnchorPoint = zoomedAnchorPoint;

    // find out which buckets we need for each plane
    const requiredBucketSet = new Set();
    for (const planeId of OrthoViewValuesWithoutTDView) {
      const [u, v] = Dimensions.getIndices(planeId);
      const texturePosition = getPosition(Store.getState().flycam);

      const centerBucket = this.cube.positionToZoomedAddress(texturePosition, logZoomStep);

      // E.g., for 17 buckets per dimension, we want to have an offset of -7 buckets so that the
      // right/lower half of the center bucket has one bucket more than the left/upper half.
      // This is necessary for the case in which the camera position is not exactly on a bucket boundary.
      // The top/left bucket is not completely shown and the part that is not necessary for rendering is
      // necessary on the bottom/right instead which is why the lower/right half gets one bucket more.
      const startingOffset = Math.floor(constants.RENDERED_BUCKETS_PER_DIMENSION / 2) - 1;
      const endOffset = constants.RENDERED_BUCKETS_PER_DIMENSION - startingOffset;

      for (let y = -startingOffset; y < endOffset; y++) {
        for (let x = -startingOffset; x < endOffset; x++) {
          const bucketAddress = ((centerBucket.slice(): any): Vector4);
          bucketAddress[u] += x;
          bucketAddress[v] += y;

          const bucket = this.cube.getOrCreateBucket(bucketAddress);

          if (bucket.type !== "null") {
            requiredBucketSet.add(bucket);
          }
        }
      }
    }

    textureBucketManager.setActiveBuckets(Array.from(requiredBucketSet), zoomedAnchorPoint);
    // $FlowFixMe
    return zoomedAnchorPoint.slice(0, 3);
  }

  setActiveMapping(mappingName: string): void {
    this.activeMapping = mappingName;

    const setMapping = mapping => {
      this.cube.setMapping(mapping);
    };

    if (mappingName != null) {
      this.mappings.getMappingArrayAsync(mappingName).then(setMapping);
    } else {
      setMapping([]);
    }
  }

  pingStop(): void {
    this.pullQueue.clearNormalPriorities();
  }

  ping = _.throttle(this.pingImpl, PING_THROTTLE_TIME);

  pingImpl(position: Vector3, { zoomStep, activePlane }: PingOptions): void {
    if (this.lastPosition != null) {
      this.direction = [
        (1 - DIRECTION_VECTOR_SMOOTHER) * this.direction[0] +
          DIRECTION_VECTOR_SMOOTHER * (position[0] - this.lastPosition[0]),
        (1 - DIRECTION_VECTOR_SMOOTHER) * this.direction[1] +
          DIRECTION_VECTOR_SMOOTHER * (position[1] - this.lastPosition[1]),
        (1 - DIRECTION_VECTOR_SMOOTHER) * this.direction[2] +
          DIRECTION_VECTOR_SMOOTHER * (position[2] - this.lastPosition[2]),
      ];
    }

    if (!_.isEqual(position, this.lastPosition) || zoomStep !== this.lastZoomStep) {
      this.lastPosition = _.clone(position);
      this.lastZoomStep = zoomStep;

      for (const strategy of this.pingStrategies) {
        if (
          strategy.forContentType(this.tracingType) &&
          strategy.inVelocityRange(this.connectionInfo.bandwidth) &&
          strategy.inRoundTripTimeRange(this.connectionInfo.roundTripTime)
        ) {
          if (zoomStep != null && activePlane != null) {
            this.pullQueue.clearNormalPriorities();
            this.pullQueue.addAll(strategy.ping(position, this.direction, zoomStep, activePlane));
          }
          break;
        }
      }

      this.pullQueue.pull();
    }
  }

  arbitraryPingImpl(matrix: Matrix4x4, zoomStep: number): void {
    for (const strategy of this.pingStrategies3d) {
      if (
        strategy.forContentType(this.tracingType) &&
        strategy.inVelocityRange(1) &&
        strategy.inRoundTripTimeRange(this.pullQueue.roundTripTime)
      ) {
        this.pullQueue.clearNormalPriorities();
        this.pullQueue.addAll(strategy.ping(matrix, zoomStep));
        break;
      }
    }

    this.pullQueue.pull();
  }

  arbitraryPing = _.once(function(matrix: Matrix4x4, zoomStep: number) {
    this.arbitraryPing = _.throttle(this.arbitraryPingImpl, PING_THROTTLE_TIME);
    this.arbitraryPing(matrix, zoomStep);
  });

  getByVerticesSync(vertices: Array<number>): Uint8Array {
    // A synchronized implementation of `get`. Cuz its faster.

    const { buffer, missingBuckets } = InterpolationCollector.bulkCollect(
      vertices,
      this.cube.getArbitraryCube(),
    );

    this.pullQueue.addAll(
      missingBuckets.map(bucket => ({
        bucket,
        priority: PullQueueConstants.PRIORITY_HIGHEST,
      })),
    );
    this.pullQueue.pull();

    return buffer;
  }
}

export default Binary;
