### define
three : THREE
./abstract_plane_material_factory : AbstractPlaneMaterialFactory
###

class PlaneMaterialFactory extends AbstractPlaneMaterialFactory


  setupAttributesAndUniforms : ->

    super()

    @uniforms = _.extend @uniforms,
      offset :
        type : "v2"
        value : new THREE.Vector2(0, 0)
      repeat :
        type : "v2"
        value : new THREE.Vector2(1, 1)
      alpha :
        type : "f"
        value : 0


  createTextures : ->

    # create textures
    @textures = {}
    for name, binary of @model.binary
      bytes = binary.targetBitDepth >> 3
      shaderName = @sanitizeName(name)
      @textures[shaderName] = @createDataTexture(@tWidth, bytes)
      @textures[shaderName].binaryCategory = binary.category
      @textures[shaderName].binaryName = binary.name

    for shaderName, texture of @textures
      @uniforms[shaderName + "_texture"] = {
        type : "t"
        value : texture
      }
      unless texture.binaryCategory == "segmentation"
        color = _.map @model.binary[texture.binaryName].color, (e) -> e / 255
        @uniforms[shaderName + "_weight"] = {
          type : "f"
          value : 1
        }
        @uniforms[shaderName + "_color"] = {
          type : "v3"
          value : new THREE.Vector3(color...)
        }


  makeMaterial : (options) ->

    super(options)

    @material.setColorInterpolation = (interpolation) =>
      for name, texture of @textures
        if texture.binaryCategory == "color"
          texture.magFilter = interpolation
          texture.needsUpdate = true

    @material.setScaleParams = ({offset, repeat}) =>
      @uniforms.offset.value.set offset.x, offset.y
      @uniforms.repeat.value.set repeat.x, repeat.y

    @material.setSegmentationAlpha = (alpha) =>
      @uniforms.alpha.value = alpha / 100


  setupChangeListeners : ->

    super()

    for binary in @model.getColorBinaries()
      do (binary) =>
        binary.on
          newColor : (color) =>
            color = _.map color, (e) -> e / 255
            uniformName = @sanitizeName(binary.name) + "_color"
            @uniforms[uniformName].value = new THREE.Vector3(color...)


  getFragmentShader : ->

    colorLayerNames = _.map @model.getColorBinaries(), (b) => @sanitizeName(b.name)
    segmentationBinary = @model.getSegmentationBinary()

    return _.template(
      """
      <% _.each(layers, function(name) { %>
        uniform sampler2D <%= name %>_texture;
        uniform vec3 <%= name %>_color;
        uniform float <%= name %>_weight;
      <% }) %>

      <% if (hasSegmentation) { %>
        uniform sampler2D <%= segmentationName %>_texture;
      <% } %>

      uniform vec2 offset, repeat;
      uniform float alpha, brightness, contrast;
      varying vec2 vUv;

      /* Inspired from: https://github.com/McManning/WebGL-Platformer/blob/master/shaders/main.frag */
      vec4 hsv_to_rgb(vec4 HSV)
      {
        vec4 RGB; /* = HSV.z; */

        float h = HSV.x;
        float s = HSV.y;
        float v = HSV.z;

        float i = floor(h);
        float f = h - i;

        float p = (1.0 - s);
        float q = (1.0 - s * f);
        float t = (1.0 - s * (1.0 - f));

        if (i == 0.0) { RGB = vec4(1.0, t, p, 1.0); }
        else if (i == 1.0) { RGB = vec4(q, 1.0, p, 1.0); }
        else if (i == 2.0) { RGB = vec4(p, 1.0, t, 1.0); }
        else if (i == 3.0) { RGB = vec4(p, q, 1.0, 1.0); }
        else if (i == 4.0) { RGB = vec4(t, p, 1.0, 1.0); }
        else /* i == -1 */ { RGB = vec4(1.0, p, q, 1.0); }

        RGB *= v;

        return RGB;
      }

      void main() {
        float golden_ratio = 0.618033988749895;
        float color_value  = 0.0;

        <% if (hasSegmentation) { %>
          vec4 volume_color = texture2D(<%= segmentationName %>_texture, vUv * repeat + offset);
          float id = (volume_color.r * 255.0);
        <% } else { %>
          float id = 0.0;
        <% } %>


        /* Get Color Value(s) */

        <% if (isRgb) { %>
          vec3 data_color = texture2D( <%= layers[0] %>_texture, vUv * repeat + offset).xyz;

        <% } else { %>
          vec3 data_color = vec3(0.0, 0.0, 0.0);

          <% _.each(layers, function(name){ %>

            /* Get grayscale value */
            color_value = texture2D( <%= name %>_texture, vUv * repeat + offset).r;

            /* Brightness / Contrast Transformation */
            color_value = (color_value + brightness - 0.5) * contrast + 0.5;

            /* Multiply with color and weight */
            data_color += color_value * <%= name %>_weight * <%= name %>_color;

          <% }) %> ;

          data_color = clamp(data_color, 0.0, 1.0);

        <% } %>


        /* Color map (<= to fight rounding mistakes) */

        if ( id > 0.1 ) {
          vec4 HSV = vec4( mod( 6.0 * id * golden_ratio, 6.0), 1.0, 1.0, 1.0 );
          gl_FragColor = mix( vec4(data_color, 1.0), hsv_to_rgb(HSV), alpha );
        } else {
          gl_FragColor = vec4(data_color, 1.0);
        }
      }
      """
      {
        layers : colorLayerNames
        hasSegmentation : segmentationBinary?
        segmentationName : @sanitizeName( segmentationBinary?.name )
        isRgb : @model.binary["color"]?.targetBitDepth == 24
      }
    )