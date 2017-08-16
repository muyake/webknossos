package com.scalableminds.braingames.datastore.tracings.skeleton

import java.io.{BufferedOutputStream, File, FileOutputStream}

import com.google.inject.Inject
import com.scalableminds.braingames.binary.helpers.DataSourceRepository
import com.scalableminds.braingames.binary.storage.kvstore.VersionedKeyValuePair
import com.scalableminds.braingames.datastore.tracings.skeleton.elements.{BranchPoint, Node, SkeletonTracing, Tree}
import com.scalableminds.braingames.datastore.tracings.{TracingDataStore, TracingService, TracingType}
import com.scalableminds.util.geometry.{BoundingBox, Point3D, Vector3D}
import com.scalableminds.util.image.Color
import com.scalableminds.util.io.{NamedEnumeratorStream, ZipIO}
import com.scalableminds.util.tools.{Fox, FoxImplicits, TextUtils}
import net.liftweb.common.{Box, Empty, Failure, Full}
import play.api.libs.Files.TemporaryFile
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.iteratee.Enumerator
import play.api.cache.Cache
import scala.concurrent.duration._
import play.api.Play.current

import scala.concurrent.Future
import scala.io.Source
import scala.reflect._

/**
  * Created by f on 28.06.17.
  */
class SkeletonTracingService @Inject()(
                                        tracingDataStore: TracingDataStore
                                      ) extends TracingService[SkeletonTracing] with FoxImplicits with TextUtils {

  implicit val tracingFormat = SkeletonTracing.jsonFormat

  implicit val tag = classTag[SkeletonTracing]

  val tracingType = TracingType.skeleton

  val tracingStore = tracingDataStore.skeletons

  def saveUpdates(tracingId: String, updateActionGroups: List[SkeletonUpdateActionGroup]): Fox[List[Unit]] = {
    Fox.combined(for {
      updateActionGroup <- updateActionGroups
    } yield {
      tracingDataStore.skeletonUpdates.putJson(tracingId, updateActionGroup.version, updateActionGroup.actions)
    })
  }

  override def applyPendingUpdates(tracing: SkeletonTracing, desiredVersion: Option[Long]): Fox[SkeletonTracing] = {
    val existingVersion = tracing.version
    findDesiredOrNewestPossibleVersion(tracing, desiredVersion).flatMap { newVersion =>
      if (newVersion > existingVersion) {
        val pendingUpdates = findPendingUpdates(tracing.id, existingVersion, newVersion)
        for {
          updatedTracing <- update(tracing, pendingUpdates, newVersion)
        } yield {
          save(updatedTracing)
          updatedTracing
        }
      } else {
        Full(tracing)
      }
    }
  }

  private def findDesiredOrNewestPossibleVersion(tracing: SkeletonTracing, desiredVersion: Option[Long]): Fox[Long] = {
    (for {
      newestUpdate <- tracingDataStore.skeletonUpdates.get(tracing.id)
    } yield {
      desiredVersion match {
        case None => newestUpdate.version
        case Some(desiredSome) => math.min(desiredSome, newestUpdate.version)
      }
    }).getOrElse(tracing.version) //if there are no updates at all, assume tracing was created from NML
  }

  private def findPendingUpdates(tracingId: String, existingVersion: Long, desiredVersion: Long): List[SkeletonUpdateAction] = {
    def toListIter(versionIterator: Iterator[VersionedKeyValuePair[List[SkeletonUpdateAction]]],
                   acc: List[List[SkeletonUpdateAction]]): List[List[SkeletonUpdateAction]] = {
      if (!versionIterator.hasNext) acc
      else {
        val item = versionIterator.next()
        if (item.version <= existingVersion) acc
        else toListIter(versionIterator, item.value :: acc)
      }
    }

    if (desiredVersion == existingVersion) List()
    else {
      val versionIterator = tracingDataStore.skeletonUpdates.scanVersionsJson[List[SkeletonUpdateAction]](tracingId, Some(desiredVersion))
      toListIter(versionIterator, List()).flatten
    }
  }

  private def update(tracing: SkeletonTracing, updates: List[SkeletonUpdateAction], newVersion: Long): Fox[SkeletonTracing] = {
    def updateIter(tracingFox: Fox[SkeletonTracing], remainingUpdates: List[SkeletonUpdateAction]): Fox[SkeletonTracing] = {
      tracingFox.futureBox.flatMap {
        case Empty => Fox.empty
        case Full(tracing) => {
          remainingUpdates match {
            case List() => Fox.successful(tracing)
            case RevertToVersionAction(sourceVersion) :: tail => {
              val sourceTracing = find(tracing.id, Some(sourceVersion), useCache = false, applyUpdates = false)
              updateIter(sourceTracing, tail)
            }
            case update :: tail => updateIter(Full(update.applyOn(tracing)), tail)
          }
        }
        case _ => tracingFox
      }
    }

    updates match {
      case List() => Full(tracing)
      case head :: tail => {
        for {
          updated <- updateIter(Some(tracing), updates)
        } yield updated.copy(version = newVersion)
      }
    }
  }

  def duplicate(tracing: SkeletonTracing): Fox[SkeletonTracing] = {
    val newTracing = tracing.copy(id = createNewId, timestamp = System.currentTimeMillis(), version = 0)
    save(newTracing).map(_ => newTracing)
  }

  private def mergeTwo(tracingA: SkeletonTracing, tracingB: SkeletonTracing) = {
    def mergeBoundingBoxes(aOpt: Option[BoundingBox], bOpt: Option[BoundingBox]) =
      for {
        a <- aOpt
        b <- bOpt
      } yield a.combineWith(b)

    val nodeMapping = TreeUtils.calculateNodeMapping(tracingA.trees, tracingB.trees)
    val mergedTrees = TreeUtils.mergeTrees(tracingA.trees, tracingB.trees, nodeMapping)
    val mergedBoundingBoxes = mergeBoundingBoxes(tracingA.boundingBox, tracingB.boundingBox)
    tracingA.copy(trees = mergedTrees, boundingBox = mergedBoundingBoxes, version = 0)
  }

  def merge(tracings: List[SkeletonTracing], newId: String = createNewId): SkeletonTracing = {
    val merged: SkeletonTracing = tracings.reduceLeft(mergeTwo)
    merged.copy(id=newId)
  }




  //TODO: move to wk
  def create(dataSetName: String, parameters: CreateEmptyParameters): SkeletonTracing = {
    val id = createNewId
    val tracing = SkeletonTracing(
      id = id,
      dataSetName = dataSetName,
      trees = createInitialTreeIfNeeded(parameters.startPosition, parameters.startRotation, parameters.insertStartAsNode, parameters.isFirstBranchPoint),
      timestamp = System.currentTimeMillis(),
      boundingBox = parameters.boundingBox,
      activeNodeId = if (parameters.insertStartAsNode.getOrElse(false)) Some(1) else None,
      editPosition = parameters.startPosition.getOrElse(Point3D(0, 0, 0)),
      editRotation = parameters.startRotation.getOrElse(Vector3D()),
      zoomLevel = 2.0,
      version = 0)
    save(tracing)
    tracing
  }

  //TODO: move to wk
  private def createInitialTreeIfNeeded(startPosition: Option[Point3D], startRotation: Option[Vector3D], insertStartAsNode: Option[Boolean],
                                        isFirstBranchPoint: Option[Boolean] = None): List[Tree] = startPosition match {
    case None => List()
    case Some(startPositionSome) => startRotation match {
      case None => List()
      case Some(startRotationSome) => {
        if (insertStartAsNode.getOrElse(false)) {
          val node = Node(1, startPositionSome, startRotationSome)
          val branchPoints = if (isFirstBranchPoint.getOrElse(false)) List(BranchPoint(node.id, System.currentTimeMillis)) else List()
          List(Tree(1, Set(node), Set.empty, Some(Color.RED), Nil, Nil))
        } else List()
      }
    }
  }

  //TODO: move to wk
  def downloadNml(tracing: SkeletonTracing, dataSourceRepository: DataSourceRepository): Option[Enumerator[Array[Byte]]] = {
    for {
      dataSource <- dataSourceRepository.findUsableByName(tracing.dataSetName)
    } yield {
      Enumerator.outputStream { os =>
        NmlWriter.toNml(tracing, os, dataSource.scale).map(_ => os.close())
      }
    }
  }

  //TODO: move to wk
  def downloadMultiple(params: DownloadMultipleParameters, dataSourceRepository: DataSourceRepository): Fox[TemporaryFile] = {
    val nmlsFox = params.tracings.map { tracingParams =>
      for {
        tracing <- find(tracingParams.tracingId, tracingParams.version, applyUpdates = true)
        tracingAsNml <- downloadNml(tracing, dataSourceRepository)
      } yield {
        (tracingAsNml, tracingParams.outfileName)
      }
    }

    for {
      nmls <- Fox.combined(nmlsFox)
      zip <- createZip(nmls, params.zipfileName)
    } yield zip
  }

  //TODO: move to wk
  private def createZip(nmls: List[(Enumerator[Array[Byte]],String)], zipFileName: String): Future[TemporaryFile] = {
    val zipped = TemporaryFile(normalize(zipFileName), ".zip")
    val zipper = ZipIO.startZip(new BufferedOutputStream(new FileOutputStream(zipped.file)))

    def addToZip(nmls: List[(Enumerator[Array[Byte]],String)]): Future[Boolean] = {
      nmls match {
        case head :: tail =>
          zipper.withFile(head._2 + ".nml")(NamedEnumeratorStream(head._1, "").writeTo).flatMap(_ => addToZip(tail))
        case _            =>
          Future.successful(true)
      }
    }

    addToZip(nmls).map { _ =>
      zipper.close()
      zipped
    }
  }

  //TODO: move to wk
  def extractAllFromZip(zipfile: Option[File]): Box[List[SkeletonTracing]] = {
    def isFailure[T](box: Box[T]) = {
      box match {
        case Failure(msg, _, _) => true
        case _ => false
      }
    }
    def findFailure[T](boxList: List[Box[T]]) = boxList.find(box => isFailure(box))

    def unzip(file: File) = {
      val boxOfBoxes: Box[List[Box[SkeletonTracing]]] = ZipIO.withUnziped(file) {
        case (filePath, is) => {
          val isNml = filePath.toString.toLowerCase.endsWith(".nml")
          if (!isNml) Empty
          else {
            val nml = Source.fromInputStream(is).mkString
            NmlParser.parse(createNewId, filePath.getFileName.toString, nml)
          }
        }
      }
      boxOfBoxes match {
        case Full(tracings: List[Box[SkeletonTracing]]) => {
          val firstFailure = findFailure(tracings)
          firstFailure match {
            case Some(Failure(msg, _, _)) => Failure("Failed to parse an NML in zipfile: " + msg)
            case _ => Full(tracings.flatten)
          }
        }
        case _ => Failure("Could not unpack zipfile")
      }
    }

    zipfile match {
      case None => Failure("Empty or No zipfile")
      case Some(file) => unzip(file)
    }
  }

}
