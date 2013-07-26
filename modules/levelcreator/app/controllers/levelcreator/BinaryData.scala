package controllers.levelcreator

import akka.actor._
import akka.dispatch._
import scala.concurrent.duration._
import play.api._
import play.api.mvc._
import play.api.data._
import play.api.libs.json.Json._
import play.api.libs.iteratee._
import play.api.libs.concurrent._
import play.libs.Akka._
import play.api.Play.current
import _root_.models.binary._
import akka.util.Timeout
import _root_.models.knowledge._
import braingames.mvc.Controller
import play.api.i18n.Messages
import braingames.geometry._
import akka.pattern.ask
import akka.pattern.AskTimeoutException
import scala.collection.mutable.ArrayBuffer
import play.api.libs.concurrent.Execution.Implicits._
import braingames.binary.models.{DataLayerId, DataLayer, DataSet}
import models.knowledge.DataSetDAO
import akka.agent.Agent
import scala.concurrent.Future
import akka.routing.RoundRobinRouter
import braingames.binary._
import braingames.binary.models.DataLayerId
import scala.Some
import braingames.binary.Cuboid
import braingames.binary.models.DataSet
import braingames.binary.SingleCubeRequest
import braingames.levelcreator.BinaryDataService
import braingames.reactivemongo.GlobalDBAccess

object BinaryData extends Controller with GlobalDBAccess with BinaryDataRequestHandler{
  val conf = Play.current.configuration

  implicit val timeout = Timeout((conf.getInt("actor.defaultTimeout") getOrElse 20) seconds) // needed for `?` below

  val binaryDataService = BinaryDataService

  def viaAjax(dataSetName: String, levelId: String, missionId: String, dataLayerName: String) =
    Action {
      implicit request =>
        Async {
          for {
            dataSet <- DataSetDAO.findOneByName(dataSetName) ?~> Messages("dataset.notFound")
            level <- Level.findOneById(levelId) ?~> Messages("level.notFound")
            mission <- Mission.findOneById(missionId) ?~> Messages("mission.notFound")
            result <- handleDataRequest(dataSet, dataLayerName, level, mission) ?~> "Data couldn'T be retireved"
          } yield {
            Ok(result)
          }
        }
    }
}

trait BinaryDataRequestHandler {
  val binaryDataService: braingames.binary.api.BinaryDataService

  def createStackCuboid(level: Level, mission: Mission) = {

    def calculateTopLeft(width: Int, height: Int, depth: Int) = {
      Vector3D(-(width / 2.0).floor, -(height / 2.0).floor, 0)
    }

    val realDirection = mission.start.direction
    //val direction = Vector3D(realDirection.x, realDirection.z, -realDirection.y)
    val direction = realDirection

    Cuboid(level.width,
      level.height,
      level.depth,
      1,
      topLeftOpt = Some(calculateTopLeft(level.width, level.height, level.depth)),
      moveVector = (Vector3D(mission.errorCenter) - (realDirection * level.slidesBeforeProblem)).toTuple,
      axis = direction.toTuple)
  }

  def handleDataRequest(dataSet: DataSet, dataLayerName: String, level: Level, mission: Mission): Future[Option[Array[Byte]]] = {
    val dataRequest = SingleCubeRequest(DataRequest(
      dataSet,
      DataLayerId(dataLayerName),
      1,
      createStackCuboid(level, mission),
      useHalfByte = false,
      skipInterpolation = false))

    binaryDataService.handleSingleCubeRequest(dataRequest)
  }
}