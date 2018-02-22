/**
 * abstract_plane_material_factory.js
 * @flow
 */

import _ from "lodash";
import * as THREE from "three";
import UpdatableTexture from "libs/UpdatableTexture";
import app from "app";
import Utils from "libs/utils";
import Model from "oxalis/model";
import type { DatasetLayerConfigurationType } from "oxalis/store";
import { listenToStoreProperty } from "oxalis/model/helpers/listener_helpers";

export type TextureMapType = {
  [key: string]: THREE.DataTexture,
};

export type UniformsType = {
  [key: string]: {
    type: "f" | "i" | "t" | "v2" | "v3",
    value: any,
  },
};

export type ShaderMaterialOptionsType = {
  polygonOffset?: boolean,
  polygonOffsetFactor?: number,
  polygonOffsetUnits?: number,
};

export function createDataTexture(
  width: number,
  bytes: number,
  optUseFloat: boolean = false,
  minFilter: THREE.NearestFilter,
  maxFilter: THREE.NearestFilter,
): THREE.DataTexture {
  const format = bytes === 1 ? THREE.LuminanceFormat : THREE.RGBFormat;

  const newTexture = new THREE.DataTexture(
    new (optUseFloat ? Float32Array : Uint8Array)(bytes * width * width),
    width,
    width,
    format, // optUseFloat ? THREE.RGBAFormat :
    optUseFloat ? THREE.FloatType : THREE.UnsignedByteType,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping,
    THREE.ClampToEdgeWrapping,
    minFilter,
    maxFilter,
  );

  return newTexture;
}

export function createUpdatableTexture(
  width: number,
  bytes: number,
  optUseFloat: boolean = false,
  renderer: THREE.WebGLRenderer,
): UpdatableTexture {
  const format = bytes === 1 ? THREE.LuminanceFormat : THREE.RGBFormat;

  const newTexture = new UpdatableTexture(
    width,
    width,
    format,
    optUseFloat ? THREE.FloatType : THREE.UnsignedByteType,
    THREE.UVMapping,
    THREE.ClampToEdgeWrapping, // todo?
    THREE.ClampToEdgeWrapping,
    THREE.NearestFilter,
    THREE.NearestFilter,
  );
  newTexture.setRenderer(renderer);
  newTexture.setSize(width, width);

  return newTexture;
}

export function sanitizeName(name: ?string): string {
  // Make sure name starts with a letter and contains
  // no "-" signs

  if (name == null) {
    return "";
  }
  return `binary_${name.replace(/-/g, "_")}`;
}

class AbstractPlaneMaterialFactory {
  material: THREE.ShaderMaterial;
  uniforms: UniformsType;
  attributes: Object;
  textures: TextureMapType;
  minFilter: THREE.NearestFilter;
  maxFilter: THREE.NearestFilter;
  tWidth: number;

  constructor(tWidth: number, textures: TextureMapType, planeID) {
    // move planeID in PlaneMaterialFactory somehow
    this.planeID = planeID;
    this.setupUniforms();
    this.makeMaterial();
    this.tWidth = tWidth;
    this.minFilter = THREE.NearestFilter;
    this.maxFilter = THREE.NearestFilter;
    this.attachTextures(textures);
    this.setupChangeListeners();
  }

  setupUniforms(): void {
    this.uniforms = {};

    for (const binary of Model.getColorBinaries()) {
      const name = sanitizeName(binary.name);
      this.uniforms[`${name}_brightness`] = {
        type: "f",
        value: 1.0,
      };
      this.uniforms[`${name}_contrast`] = {
        type: "f",
        value: 1.0,
      };
    }
  }

  makeMaterial(options?: ShaderMaterialOptionsType): void {
    this.material = new THREE.ShaderMaterial(
      _.extend(options, {
        uniforms: this.uniforms,
        vertexShader: this.getVertexShader(),
        fragmentShader: this.getFragmentShader(),
      }),
    );

    window.materials = (window.materials || []).concat(this.material);

    this.material.setData = (name, data) => {
      const textureName = sanitizeName(name);
      const texture = this.textures[textureName];
      if (texture) {
        console.time("set texture" + name);
        // debugger;
        // texture.image.data.set(data);
        texture.image.data = data;
        console.timeEnd("set texture" + name);
        texture.needsUpdate = true;
      }
    };
  }

  setupChangeListeners(): void {
    listenToStoreProperty(
      state => state.datasetConfiguration.layers,
      layerSettings => {
        _.forEach(layerSettings, (settings, layerName) => {
          const name = sanitizeName(layerName);
          this.updateUniformsForLayer(settings, name);
        });

        app.vent.trigger("rerender");
      },
      true,
    );
  }

  updateUniformsForLayer(settings: DatasetLayerConfigurationType, name: string) {
    this.uniforms[`${name}_brightness`].value = settings.brightness / 255;
    this.uniforms[`${name}_contrast`].value = settings.contrast;
  }

  getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  attachTextures(textures: TextureMapType): void {
    throw new Error("Subclass responsibility");
  }

  getFragmentShader(): string {
    throw new Error("Subclass responsibility");
  }

  getVertexShader(): string {
    return `
    varying vec2 vPos;

varying vec2 vUv;

void main() {
  vUv = uv;
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
  }
}

export default AbstractPlaneMaterialFactory;
