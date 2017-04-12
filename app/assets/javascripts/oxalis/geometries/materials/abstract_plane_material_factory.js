/**
 * abstract_plane_material_factory.js
 * @flow weak
 */

import _ from "lodash";
import * as THREE from "three";
import app from "app";
import Utils from "libs/utils";
import Model from "oxalis/model";
import Store from "oxalis/store";

type Uniform = {
  type: string,
  value: any,
};

type Uniforms = {
  [key: string]: Uniform,
};

class AbstractPlaneMaterialFactory {

  model: Model;
  material: THREE.ShaderMaterial;
  uniforms: Uniforms;
  attributes: Object;
  textures: {
    [key: string]: THREE.DataTexture;
  };
  minFilter: THREE.NearestFilter;
  maxFilter: THREE.NearestFilter;
  tWidth: number;

  constructor(model: Model, tWidth: number) {
    this.model = model;

    this.setupUniforms();
    this.makeMaterial();
    this.setupChangeListeners();
    this.tWidth = tWidth;
    this.minFilter = THREE.NearestFilter;
    this.maxFilter = THREE.NearestFilter;
    this.createTextures();
  }


  setupUniforms() {
    this.uniforms = {};

    for (const binary of this.model.getColorBinaries()) {
      const name = this.sanitizeName(binary.name);
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


  makeMaterial(options) {
    this.material = new THREE.ShaderMaterial(_.extend(options, {
      uniforms: this.uniforms,
      vertexShader: this.getVertexShader(),
    }));

    this.material.setData = (name, data) => {
      const textureName = this.sanitizeName(name);
      Utils.__guard__(this.textures[textureName], x => x.image.data.set(data));
      Utils.__guard__(this.textures[textureName], (x1) => { x1.needsUpdate = true; });
    };
  }


  setupChangeListeners() {
    Store.subscribe(() => {
      const layerSettings = Store.getState().datasetConfiguration.layers;
      _.forEach(layerSettings, (settings, layerName) => {
        const name = this.sanitizeName(layerName);
        this.uniforms[`${name}_brightness`].value = settings.brightness / 255;
        this.uniforms[`${name}_contrast`].value = settings.contrast;
      });

      app.vent.trigger("rerender");
    });
  }

  getMaterial() {
    return this.material;
  }

  createTextures() {
    throw new Error("Subclass responsibility");
  }


  sanitizeName(name) {
    // Make sure name starts with a letter and contains
    // no "-" signs

    if (name == null) { return null; }
    return `binary_${name.replace(/-/g, "_")}`;
  }


  createDataTexture(width, bytes) {
    const format = bytes === 1 ? THREE.LuminanceFormat : THREE.RGBFormat;

    return new THREE.DataTexture(
      new Uint8Array(bytes * width * width), width, width,
      format, THREE.UnsignedByteType,
      THREE.UVMapping,
      THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping,
      this.minFilter, this.maxFilter,
    );
  }


  getVertexShader() {
    return `\


varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position =   projectionMatrix *
                  modelViewMatrix *
                  vec4(position,1.0); }\
`;
  }
}

export default AbstractPlaneMaterialFactory;
