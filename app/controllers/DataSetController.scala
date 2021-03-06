package controllers

import javax.inject.Inject

import com.scalableminds.util.reactivemongo.GlobalAccessContext
import com.scalableminds.util.tools.DefaultConverters._
import com.scalableminds.util.tools.Fox
import models.binary._
import models.team.TeamDAO
import models.user.{User, UserService}
import oxalis.ndstore.{ND2WK, NDServerConnection}
import oxalis.security.WebknossosSilhouette.{SecuredAction, SecuredRequest, UserAwareAction}
import play.api.Play.current
import play.api.cache.Cache
import play.api.i18n.{Messages, MessagesApi}
import play.api.libs.functional.syntax._
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits._
import scala.concurrent.Future
import scala.concurrent.duration._

class DataSetController @Inject()(val messagesApi: MessagesApi) extends Controller {

  val ThumbnailWidth = 200
  val ThumbnailHeight = 200

  val ThumbnailCacheDuration = 1 day

  val dataSetPublicReads =
    ((__ \ 'description).readNullable[String] and
      (__ \ 'isPublic).read[Boolean]).tupled


  def thumbnail(dataSetName: String, dataLayerName: String) = UserAwareAction.async { implicit request =>

    def imageFromCacheIfPossible(dataSet: DataSet) =
    // We don't want all images to expire at the same time. Therefore, we add a day of randomness, hence the 1 day
      Cache.get(s"thumbnail-$dataSetName*$dataLayerName") match {
        case Some(a: Array[Byte]) =>
          Fox.successful(a)
        case _ =>
          dataSet.dataStore.requestDataLayerThumbnail(dataLayerName, ThumbnailWidth, ThumbnailHeight).map{
            result =>
              Cache.set(s"thumbnail-$dataSetName*$dataLayerName",
                result,
                (ThumbnailCacheDuration.toSeconds + math.random * 2.hours.toSeconds).toInt)
              result
          }
      }

    for {
      dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
      layer <- DataSetService.getDataLayer(dataSet, dataLayerName) ?~> Messages("dataLayer.notFound", dataLayerName)
      image <- imageFromCacheIfPossible(dataSet)
    } yield {
      Ok(image).withHeaders(
        CONTENT_LENGTH -> image.length.toString,
        CONTENT_TYPE -> play.api.libs.MimeTypes.forExtension("jpeg").getOrElse(play.api.http.ContentTypes.BINARY)
      )
    }
  }

  def list = UserAwareAction.async { implicit request =>
    UsingFilters(
      Filter("isEditable", (value: Boolean, el: DataSet) =>
        el.isEditableBy(request.identity) && value || !el.isEditableBy(request.identity) && !value),
      Filter("isActive", (value: Boolean, el: DataSet) =>
        el.isActive == value)
    ) { filter =>
      DataSetDAO.findAll.map {
        dataSets =>
          Ok(Writes.list(DataSet.dataSetPublicWrites(request.identity)).writes(filter.applyOn(dataSets)))
      }
    }
  }

  def accessList(dataSetName: String) = SecuredAction.async { implicit request =>
    for {
      dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
      users <- UserService.findByTeams(dataSet.allowedTeams)
    } yield {
      Ok(Writes.list(User.userCompactWrites).writes(users))
    }
  }

  def read(dataSetName: String) = UserAwareAction.async { implicit request =>
    for {
      dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
    } yield {
      Ok(DataSet.dataSetPublicWrites(request.identity).writes(dataSet))
    }
  }

  def update(dataSetName: String) = SecuredAction.async(parse.json) { implicit request =>
    withJsonBodyUsing(dataSetPublicReads) {
      case (description, isPublic) =>
      for {
        dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
        _ <- allowedToAdministrate(request.identity, dataSet)
        updatedDataSet <- DataSetService.update(dataSet, description, isPublic)
      } yield {
        Ok(DataSet.dataSetPublicWrites(Some(request.identity)).writes(updatedDataSet))
      }
    }
  }


  def importDataSet(dataSetName: String) = SecuredAction.async { implicit request =>
    for {
      _ <- DataSetService.isProperDataSetName(dataSetName) ?~> Messages("dataSet.import.impossible.name")
      dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
      result <- DataSetService.importDataSet(dataSet)
    } yield {
      Status(result.status)(result.body)
    }
  }

  def updateTeams(dataSetName: String) = SecuredAction.async(parse.json) { implicit request =>
    withJsonBodyAs[List[String]] { teams =>
      for {
        dataSet <- DataSetDAO.findOneBySourceName(dataSetName) ?~> Messages("dataSet.notFound", dataSetName)
        _ <- allowedToAdministrate(request.identity, dataSet)
        userTeams <- TeamDAO.findAll.map(_.filter(team => team.isEditableBy(request.identity)))
        teamsWithoutUpdate = dataSet.allowedTeams.filterNot(t => userTeams.exists(_.name == t))
        teamsWithUpdate = teams.filter(t => userTeams.exists(_.name == t))
        _ <- DataSetService.updateTeams(dataSet, teamsWithUpdate ++ teamsWithoutUpdate)
      } yield
      Ok(Json.toJson(teamsWithUpdate ++ teamsWithoutUpdate))
    }
  }

  val externalDataSetFormReads =
    ((__ \ 'server).read[String] and
      (__ \ 'name).read[String] and
      (__ \ 'token).read[String] and
      (__ \ 'team).read[String]).tupled

  private def createNDStoreDataSet(implicit request: SecuredRequest[JsValue]) =
    withJsonBodyUsing(externalDataSetFormReads){
      case (server, name, token, team) =>
        for {
          _ <- DataSetService.checkIfNewDataSetName(name) ?~> Messages("dataSet.name.alreadyTaken")
          _ <- ensureTeamAdministration(request.identity, team)
          ndProject <- NDServerConnection.requestProjectInformationFromNDStore(server, name, token)
          dataSet <- ND2WK.dataSetFromNDProject(ndProject, team)
          _ <-  DataSetDAO.insert(dataSet)(GlobalAccessContext)
        } yield JsonOk(Messages("dataSet.create.success"))
    }

  def create(typ: String) = SecuredAction.async(parse.json) { implicit request =>
    typ match {
      case "ndstore" =>
        createNDStoreDataSet(request)
      case _ =>
        Future.successful(JsonBadRequest(Messages("dataSet.type.invalid", typ)))
    }
  }

}
