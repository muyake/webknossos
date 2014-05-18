### define
underscore : _
../pagination_collection : PaginationCollection
format_utils : FormatUtils
###

class TaskCollection extends Backbone.Collection
  # extends PaginationCollection

  # TODO: solve conflict
  # super class should be PaginationCollection for task list
  #             should be Backbone.Collection for task type list

  url : "/api/tasks"

  constructor : (taskTypeID) ->

    if taskTypeID
      @url = "/admin/taskTypes/#{taskTypeID}/tasks"
    super()


  parse : (respones) ->

    _.map(respones,
      (response) ->

        # apply some defaults
        response.type =
          summary : response.type?.summary || "<deleted>"
        response.formattedTracingTime = FormatUtils.formatSeconds(response.tracingTime? or 0)

        # convert bounding box
        if response.boundingBox?

          { topLeft, width, height, depth } = response.boundingBox
          response.boundingBox = topLeft.concat [
            topLeft[0] + width
            topLeft[1] + height
            topLeft[2] + depth
          ]

        else
          response.boundingBox = []

        return response
    )
