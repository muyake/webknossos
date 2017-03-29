/**
 * view.js
 * @flow weak
 */

import $ from "jquery";
import app from "app";
import * as THREE from "three";
import constants from "oxalis/constants";
import Model from "oxalis/model";
import Toast from "libs/toast";

class View {

  model: Model;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  theme: 0 | 1;

  constructor(model) {
    this.model = model;
    if (!this.isWebGlSupported()) {
      Toast.error("Couldn't initialise WebGL, please make sure you are using Google Chrome and WebGL is enabled.<br>" +
        "<a href='http://get.webgl.org/'>http://get.webgl.org/</a>");
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.scene = new THREE.Scene();

    this.setTheme(constants.THEME_BRIGHT);

    // disable loader
    $("#loader").addClass("hidden");
  }


  toggleTheme() {
    if (this.theme === constants.THEME_BRIGHT) {
      return this.setTheme(constants.THEME_DARK);
    } else {
      return this.setTheme(constants.THEME_BRIGHT);
    }
  }


  setTheme(theme) {
    this.theme = theme;
    app.vent.trigger("view:setTheme", theme);

    if (theme === constants.THEME_BRIGHT) {
      return $("body").attr("class", "bright");
    } else {
      return $("body").attr("class", "dark");
    }
  }


  isWebGlSupported() {
    return window.WebGLRenderingContext && document.createElement("canvas").getContext("experimental-webgl");
  }
}

export default View;
