import _ from "lodash";
import Marionette from "backbone.marionette";
import app from "app";
import Input from "libs/input";
import Toast from "libs/toast";
import Request from "libs/request";
import SortTableBehavior from "libs/behaviors/sort_table_behavior";
import ExplorativeTracingListItemView from "./explorative_tracing_list_item_view";
import UserAnnotationsCollection from "../models/user_annotations_collection";


class ExplorativeTracingListView extends Marionette.CompositeView {
  static initClass() {
  
    this.prototype.template  = _.template(`\
<h3>Explorative Annotations</h3>
<% if (!isAdminView) {%>
  <div>
    <form action="<%- jsRoutes.controllers.AnnotationIOController.upload().url %>"
      method="POST"
      enctype="multipart/form-data"
      id="upload-and-explore-form"
      class="form-inline inline-block">
      <div id="fileinput" class="fileinput fileinput-new" data-provides="fileinput">
        <span class="btn btn-default btn-file">
          <span>
            <i class="fa fa-upload fileinput-new" id="form-upload-icon"></i>
            <i class="fa fa-spinner fa-spin fileinput-exists" id="form-spinner-icon"></i>
            Upload Annotation
          </span>
          <input type="file" name="nmlFile" multiple accept=".nml, .zip">
        </span>
      </div>
    </form>
  
    <div class="divider-vertical"></div>
  
    <% if (showArchivedAnnotations) { %>
    <a href="#" id="toggle-view-open" class="btn btn-default">
      <i class="fa fa-spinner fa-spin hide" id="toggle-view-spinner-icon"></i>
        Show open tracings
    </a>
    <% } else {%>
    <a href="#" id="toggle-view-archived" class="btn btn-default">
      <i class="fa fa-spinner fa-spin hide" id="toggle-view-spinner-icon"></i>
      Show archived tracings
    </a>
    <a href="#" id="archive-all" class="btn btn-default">
      Archive all
    </a>
    <% } %>
  </div>
<% } %>
  
<table class="table table-striped table-hover sortable-table" id="explorative-tasks">
  <thead>
    <tr>
      <th data-sort="formattedHash"> # </th>
      <th data-sort="name"> Name </th>
      <th data-sort="dataSetName"> DataSet </th>
      <th> Stats </th>
      <th> Type </th>
      <th data-sort="created"> Created </th>
      <th> </th>
    </tr>
  </thead>
  <tbody></tbody>
</table>\
`);
  
    this.prototype.childView  = ExplorativeTracingListItemView;
    this.prototype.childViewContainer  = "tbody";
    this.prototype.childViewOptions =
      {parent : null};
  
    this.prototype.events  = {
      "change.bs.fileinput .fileinput" : "selectFiles",
      "submit @ui.uploadAndExploreForm" : "uploadFiles",
      "click @ui.toggleViewArchivedButton" : "fetchArchivedAnnotations",
      "click @ui.toggleViewOpenButton" : "fetchOpenAnnotations",
      "click @ui.archiveAllButton" : "archiveAll"
    };
  
    this.prototype.ui  = {
      fileinput : "#fileinput",
      tracingChooser : "#tracing-chooser",
      uploadAndExploreForm : "#upload-and-explore-form",
      uploadFileInput : "#upload-and-explore-form input[type=file]",
      formSpinnerIcon : "#form-spinner-icon",
      formUploadIcon : "#form-upload-icon",
      toggleViewArchivedButton : "#toggle-view-archived",
      toggleViewOpenButton : "#toggle-view-open",
      toggleViewSpinner : "#toggle-view-spinner-icon",
      archiveAllButton : "#archive-all"
    };
  
    this.prototype.behaviors  = {
      SortTableBehavior : {
        behaviorClass : SortTableBehavior
      }
    };
  }

  templateContext() {
    return {
      isAdminView : this.options.isAdminView,
      showArchivedAnnotations : this.showArchivedAnnotations
    };
  }


  initialize(options) {

    this.options = options;
    this.childViewOptions.parent = this;
    this.collection = new UserAnnotationsCollection([], {userID : this.options.userID});

    this.showArchivedAnnotations = false;
    return this.collection.fetch();
  }


  selectFiles(event) {

    if (this.ui.uploadFileInput[0].files.length) {
      return this.ui.uploadAndExploreForm.submit();
    }
  }


  uploadFiles(event) {

    event.preventDefault();

    const form = this.ui.uploadAndExploreForm;

    return Request.sendMultipartFormReceiveJSON(
      form.attr("action"),
      {data : new FormData(form[0])}
    ).then(
      function(data) {
        const url = `/annotations/${data.annotation.typ}/${data.annotation.id}`;
        app.router.loadURL(url);
        return Toast.message(data.messages);
      },
      () => this.ui.fileinput.fileinput("clear")
    );
  }


  archiveAll() {

    if (!confirm("Are you sure you want to archive all explorative annotations?")) {
      return;
    }

    const unarchivedAnnoationIds = this.collection.pluck("id");
    return Request.sendJSONReceiveJSON(
      jsRoutes.controllers.AnnotationController.finishAll("Explorational").url,
      {
        method: "POST",
        data: {
          annotations: unarchivedAnnoationIds
        }
      }
    ).then(
      data => {
        Toast.message(data.messages);
        this.collection.reset();
        return this.render();
      }
    );
  }

  fetchArchivedAnnotations() {
    this.ui.toggleViewSpinner.toggleClass("hide", false);
    this.showArchivedAnnotations = true;
    this.collection.isFinished = true;
    return this.collection.fetch().then(() => this.render());
  }

  fetchOpenAnnotations() {
    this.ui.toggleViewSpinner.toggleClass("hide", false);
    this.showArchivedAnnotations = false;
    this.collection.isFinished = false;
    return this.collection.fetch().then(() => this.render());
  }

  toggleViewArchivedText() {

    const verb = this.showArchivedAnnotations ? "open" : "archived";
    return `Show ${verb} tracings `;
  }
}
ExplorativeTracingListView.initClass();


export default ExplorativeTracingListView;