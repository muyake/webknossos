/**
 * arbitrary_plane_material_factory.js
 * @flow
 */

import _ from "lodash";
import * as THREE from "three";
import Model from "oxalis/model";
import AbstractPlaneMaterialFactory from "oxalis/geometries/materials/abstract_plane_material_factory";

class ArbitraryPlaneMaterialFactory extends AbstractPlaneMaterialFactory {
  getColorName(): string {
    return this.sanitizeName(Model.getColorBinaries()[0].name);
  }

  createTextures(): void {
    this.textures = {};
    this.textures[this.getColorName()] = this.createDataTexture(this.tWidth, 1);

    this.uniforms[`${this.getColorName()}_texture`] = {
      type: "t",
      value: this.textures[this.getColorName()],
    };
  }

  createDataTexture(width: number, bytes: number): void {
    this.minFilter = THREE.LinearFilter;
    return super.createDataTexture(width, bytes);
  }

  getFragmentShader(): string {
    return _.template(
      `\
uniform sampler2D <%= colorName %>_texture;
uniform float <%= colorName %>_brightness, <%= colorName %>_contrast;
varying vec2 vUv;

void main()
{
  float color_value = 0.0;

  // Need to mirror y for some reason.
  vec2 texture_pos = vec2(vUv.x, 1.0 - vUv.y);

  /* Get grayscale value */
  color_value = texture2D( <%= colorName %>_texture, texture_pos).r;

  /* Brightness / Contrast Transformation */
  color_value = (color_value + <%= colorName %>_brightness - 0.5) * <%= colorName %>_contrast + 0.5;

  /* Set frag color */
  gl_FragColor = vec4(color_value, color_value, color_value, 1.0);
}\
`,
    )({ colorName: this.getColorName() });
  }
}

export default ArbitraryPlaneMaterialFactory;
