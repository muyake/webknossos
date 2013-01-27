### define
jquery : $
underscore : _
./controller/controller2d : Controller2d
./controller/controller3d : Controller3d
./model : Model
../libs/event_mixin : EventMixin
../libs/input : Input
###

TYPE_USUAL       = 0
TYPE_BRANCH      = 1
VIEWPORT_WIDTH   = 380
WIDTH            = 384
TEXTURE_SIZE     = 512
TEXTURE_SIZE_P   = 9
DISTANCE_3D      = 140

MODE_2D          = 0
MODE_3D          = 1


class Controller

  mode : null
  

  constructor : ->

    _.extend(@, new EventMixin())

    @fullScreen = false
    @mode = MODE_2D

    @model = new Model()

    @model.initialize(TEXTURE_SIZE_P, VIEWPORT_WIDTH, DISTANCE_3D).done =>

      # FPS stats
      stats = new Stats()
      stats.getDomElement().id = "stats"
      $("body").append stats.getDomElement() 

      @controller2d = new Controller2d(@model, stats)
      @controller2d.bind()
      @controller2d.start()
      @controller3d = new Controller3d(@model, stats)


      @initMouse()
      @initKeyboard()


  initMouse : ->

    # hide contextmenu, while rightclicking a canvas
    $("#render").bind "contextmenu", (event) ->
      event.preventDefault()
      return


  initKeyboard : ->
    
    # avoid scrolling while pressing space
    $(document).keydown (event) ->
      event.preventDefault() if (event.which == 32 or event.which == 18 or 37 <= event.which <= 40) and !$(":focus").length
      return

    new Input.KeyboardNoLoop(

      #ScaleTrianglesPlane
      "m" : => @switch()
    )


  switch : ->
    
    if @mode is MODE_2D
      @controller2d.unbind()
      @controller2d.stop() 
      @initKeyboard()     

      @controller3d.bind()
      @controller3d.cam.setPosition(@controller2d.flycam.getPosition())
      @controller3d.show()
      @mode = MODE_3D
    else
      @controller3d.unbind()
      @controller3d.hide()      
      @initKeyboard()


      @controller2d.bind()
      @controller2d.flycam.setPosition(@controller3d.cam.getPosition())
      @controller2d.start()
      @mode = MODE_2D