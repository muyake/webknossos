### define
../setting_views/color_setting_view : ColorSettingView
../setting_views/slider_setting_view : SliderSettingView
../setting_views/button_setting_view : ButtonSettingView
./category_view : CategoryView
###

class ColorsCategoryView extends CategoryView


  caption : "Colors"


  subviewCreators :

    "reset" : ->

      return new ButtonSettingView(
        model : @model
        options :
          displayName : "Reset Color Settings"
          callbackName : "reset"
      )

    "brightness" : ->

      return new SliderSettingView(
        model : @model
        options :
          name : "brightness"
          displayName : "Brightness"
          min : -256
          max : 256
          step : 5
      )

    "contrast" : ->

      return new SliderSettingView(
        model : @model
        options :
          name : "contrast"
          displayName : "Contrast"
          min : 0.5
          max : 5
          step : 0.1
      )

  initialize : ->

    for key of @model.get("layerColors")

      do (key) =>
        @subviewCreators[key] = -> new ColorSettingView(
          model : @model
          options :
            name : "layerColors.#{key}"
            displayName : "Layer: #{key}"
        )

    super()