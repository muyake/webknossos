### define
underscore : _
format_utils : FormatUtils
###

class TaskTypeCollection extends Backbone.Collection

  url : "/api/taskTypes"


  parse : (responses) ->

    _.map(responses, (response) ->
      response.formattedHash = FormatUtils.formatHash(response.id)
      response.formattedShortText = FormatUtils.formatShortText(response.summary)

      return response
    )
