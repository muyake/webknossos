### define
underscore : _
backbone.marionette : marionette
worker!libs/viz.js : VizWorker
libs/pan_zoom_svg  : PanZoomSVG
moment : moment
###

class TaskOverviewView extends Backbone.Marionette.View

  ui :
    "graphData" : "#graphData"
    "userData" : "#userData"
    "graph" : ".graph"


  initialize : ->

    # Backbone.Marionette internal method
    @bindUIElements()

    # graphSource = @ui.graphData.html().replace( /"[^"]+"/gm, (a) -> a.replace(" "," ") )
    userData = JSON.parse(@ui.userData.html())

    @getSVG().done( (graphSource) =>
      VizWorker.send(
        source : graphSource
        format : "svg"
        layoutEngine : "neato"
      ).then(
        (svgResult) =>

          # remove error messages
          startIndex = svgResult.indexOf("<?xml")
          svgResult = svgResult.slice(startIndex, svgResult.length - 1)

          @ui.graph.html(svgResult)

          @setupPopovers(userData)
          @setupPanZoom()

        (error) =>
          @ui.graph.html("<i class=\"fa fa-warning-sign\"></i>#{error.replace(/\n/g,"<br>")}")
      )
    )
  

  getSVG : ->

    $.get("http://localhost:9000/admin/tasks/overviewNew").then( (data) =>

      { userInfos, taskTypes, projects } = data

      edge = (a, b) -> "\"" + a + "\"->\"" + b + "\";"
      quoted = (str) -> '"' + str + '"'

      # svg parts

      svgHead = """
                digraph G {
                  size="10,10";
                  overlap=false;
                  graph [ bgcolor="transparent" ];
                  node [ fontname="Helvetica,Arial,sans-serif", fontsize=10.5, style=filled, fillcolor="#ffffff", pencolor="black" ];
                """
      
      svgTaskTypes = taskTypes.map( (taskType) -> quoted(taskType.summary) + ";").join("\n")
      svgProjects = projects.map( (project) -> quoted(project.name) + ";" ).join("\n")

      svgUsers = _.pluck(userInfos, "user").map( (user) =>
        userName = user.firstName + " " + user.lastName
        lastActivityDays = moment().diff(user.lastActivity, 'days')
        color = @colorJet(Math.min(50, lastActivityDays) * (128 / 50) + 128)

        quoted(userName) + " [id="+ quoted(user._id["$oid"]) + ", shape=box, fillcolor=" + quoted(color) + "];"
      ).join("\n")


      svgUserTaskEdges = userInfos.map( (userInfo) ->
        {user, taskTypes} = userInfo
        userName = user.firstName + " " + user.lastName

        taskTypes.map( (taskType) -> edge(userName, taskType.summary)).join("\n")
      ).join("\n")


      svgUserProjectEdges = userInfos.map( (userInfo) ->
        {user, projects} = userInfo
        userName = user.firstName + " " + user.lastName

        projects.map( (project) -> edge(userName, project.name)).join("\n")
      ).join("\n")

      tail = "edge [ color=blue ];  }"

      return svgHead + svgTaskTypes + svgUsers + svgProjects + svgUserTaskEdges + svgUserProjectEdges + tail
    )


  setupPanZoom : ->

    # reset some attributes before invoking panZoom plugin
    $svg = @$(".graph.well").find("svg")
    
    # get rid of the troublemaker. messes up transformations
    $svg[0].removeAttribute("viewBox")
    
    $svg[0].setAttribute("width", "#{$(window).width() - 100}px")
    $svg[0].setAttribute("height", "#{$(window).height() - 50 - $svg.offset().top}px" )
    $svg.css("max-width", "100%")

    new PanZoomSVG($svg)


  setupPopovers : (userData) ->

    userData.map( (user) ->
      $("#" + user.id + " > text").popover(
        title: user.name,
        html: true,
        trigger: "hover",
        content: user.tooltip
      )
    )


  colorJet : (value) ->

    fourValue = value / 64
    
    clamp = (value, min, max) -> return Math.min(Math.max(value, min), max)
    
    componentToHex = (c) ->
      hex = Math.floor(c * 255).toString(16)
      if hex.length == 1 then "0" + hex else hex

    rgbToHex = (r, g, b) -> "#" + [r, g, b].map(componentToHex).join("")
    
    r = clamp(Math.min(fourValue - 1.5, -fourValue + 4.5), 0, 1)
    g = clamp(Math.min(fourValue - 0.5, -fourValue + 3.5), 0, 1)
    b = clamp(Math.min(fourValue + 0.5, -fourValue + 2.5), 0, 1)
          
    rgbToHex(r, g, b)