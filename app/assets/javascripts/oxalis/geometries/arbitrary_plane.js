/**
 * arbitrary_plane.js
 * @flow
 */

import _ from "lodash";
import BackboneEvents from "backbone-events-standalone";
import * as THREE from "three";
import { M4x4, V3 } from "libs/mjs";
import constants from "oxalis/constants";
import type { ModeType } from "oxalis/constants";
import Model from "oxalis/model";
import Store from "oxalis/store";
import { getZoomedMatrix } from "oxalis/model/accessors/flycam_accessor";

import ArbitraryPlaneMaterialFactory from "oxalis/geometries/materials/arbitrary_plane_material_factory";

// Let's set up our trianglesplane.
// It serves as a "canvas" where the brain images
// are drawn.
// Don't let the name fool you, this is just an
// ordinary plane with a texture applied to it.
//
// User tests showed that looking a bend surface (a half sphere)
// feels more natural when moving around in 3D space.
// To acknowledge this fact we determine the pixels that will
// be displayed by requesting them as though they were
// attached to bend surface.
// The result is then projected on a flat surface.

class ArbitraryPlane {
  mesh: THREE.Mesh;
  isDirty: boolean;
  queryVertices: ?Float32Array;
  width: number;
  // TODO: Probably unused? Recheck when flow coverage is higher
  height: number;
  x: number;
  textureMaterial: THREE.RawShaderMaterial;

  // Copied from backbone events (TODO: handle this better)
  listenTo: Function;

  constructor() {
    this.isDirty = true;
    this.height = 0;
    this.width = constants.VIEWPORT_WIDTH;
    _.extend(this, BackboneEvents);

    this.mesh = this.createMesh();

    for (const name of Object.keys(Model.binary)) {
      const binary = Model.binary[name];
      binary.cube.on("bucketLoaded", () => {
        this.isDirty = true;
      });
    }

    if ((Math.log(this.width) / Math.LN2) % 1 === 1) {
      throw new Error("width needs to be a power of 2");
    }

    Store.subscribe(() => {
      this.isDirty = true;
    });
  }

  setMode(mode: ModeType) {
    switch (mode) {
      case constants.MODE_ARBITRARY:
        this.queryVertices = this.calculateSphereVertices(
          Store.getState().userConfiguration.sphericalCapRadius,
        );
        break;
      case constants.MODE_ARBITRARY_PLANE:
        this.queryVertices = this.calculatePlaneVertices();
        break;
      default:
        this.queryVertices = null;
        break;
    }

    this.isDirty = true;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.mesh);
  }

  update() {
    if (this.isDirty) {
      const { mesh } = this;

      const matrix = getZoomedMatrix(Store.getState().flycam);

      const queryMatrix = M4x4.scale1(1, matrix);
      const newVertices = M4x4.transformPointsAffine(queryMatrix, this.queryVertices);
      const newColors = Model.getColorBinaries()[0].getByVerticesSync(newVertices);

      this.textureMaterial.setData("color", newColors);

      mesh.matrix.set(
        matrix[0],
        matrix[4],
        matrix[8],
        matrix[12],
        matrix[1],
        matrix[5],
        matrix[9],
        matrix[13],
        matrix[2],
        matrix[6],
        matrix[10],
        matrix[14],
        matrix[3],
        matrix[7],
        matrix[11],
        matrix[15],
      );

      mesh.matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
      mesh.matrixWorldNeedsUpdate = true;

      this.isDirty = false;
    }
  }

  calculateSphereVertices = _.memoize(sphericalCapRadius => {
    const queryVertices = new Float32Array(this.width * this.width * 3);

    // so we have Point [0, 0, 0] centered
    let currentIndex = 0;

    const vertex = [0, 0, 0];
    let vector = [0, 0, 0];
    const centerVertex = [0, 0, -sphericalCapRadius];

    // Transforming those normalVertices to become a spherical cap
    // which is better more smooth for querying.
    // http://en.wikipedia.org/wiki/Spherical_cap
    for (let y = 0; y < this.width; y++) {
      for (let x = 0; x < this.width; x++) {
        vertex[0] = x - Math.floor(this.width / 2);
        vertex[1] = y - Math.floor(this.width / 2);
        vertex[2] = 0;

        vector = V3.sub(vertex, centerVertex, vector);
        const length = V3.length(vector);
        vector = V3.scale(vector, sphericalCapRadius / length, vector);

        queryVertices[currentIndex++] = centerVertex[0] + vector[0];
        queryVertices[currentIndex++] = centerVertex[1] + vector[1];
        queryVertices[currentIndex++] = centerVertex[2] + vector[2];
      }
    }

    return queryVertices;
  });

  calculatePlaneVertices = _.memoize(() => {
    const queryVertices = new Float32Array(this.width * this.width * 3);

    // so we have Point [0, 0, 0] centered
    let currentIndex = 0;

    for (let y = 0; y < this.width; y++) {
      for (let x = 0; x < this.width; x++) {
        queryVertices[currentIndex++] = x - Math.floor(this.width / 2);
        queryVertices[currentIndex++] = y - Math.floor(this.width / 2);
        queryVertices[currentIndex++] = 0;
      }
    }

    return queryVertices;
  });

  setSphericalCapRadius(sphericalCapRadius: number) {
    if (Store.getState().temporaryConfiguration.viewMode === constants.MODE_ARBITRARY) {
      this.queryVertices = this.calculateSphereVertices(sphericalCapRadius);
      this.isDirty = true;
    }
  }

  createMesh() {
    this.textureMaterial = new ArbitraryPlaneMaterialFactory(this.width).getMaterial();

    // create mesh
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.width, 1, 1),
      this.textureMaterial,
    );
    plane.rotation.x = Math.PI;
    this.x = 1;

    plane.matrixAutoUpdate = false;
    plane.doubleSided = true;

    return plane;
  }
}

export default ArbitraryPlane;
