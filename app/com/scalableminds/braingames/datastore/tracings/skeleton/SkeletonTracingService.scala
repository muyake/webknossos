package com.scalableminds.braingames.datastore.tracings.skeleton

import java.io.{BufferedOutputStream, File, FileOutputStream}
import java.util.UUID

import com.google.inject.Inject
import com.scalableminds.braingames.binary.helpers.DataSourceRepository
import com.scalableminds.braingames.binary.storage.kvstore.VersionedKeyValuePair
import com.scalableminds.braingames.datastore.tracings.TracingDataStore
import com.scalableminds.braingames.datastore.tracings.skeleton.elements.SkeletonTracing
import com.scalableminds.util.geometry.{BoundingBox, Scale}
import com.scalableminds.util.io.{NamedEnumeratorStream, ZipIO}
import com.scalableminds.util.tools.{Fox, FoxImplicits, TextUtils}
import net.liftweb.common.{Box, Full}
import play.api.i18n.Messages
import play.api.libs.Files.TemporaryFile
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.iteratee.Enumerator

import scala.concurrent.Future
import scala.io.Source

/**
  * Created by f on 28.06.17.
  */
class SkeletonTracingService @Inject()(
                                        tracingDataStore: TracingDataStore
                                      ) extends FoxImplicits with TextUtils {

  def createNewId(): String = UUID.randomUUID.toString

  def find(tracingId: String, version: Option[Long] = None): Box[SkeletonTracing] =
    tracingDataStore.skeletons.getJson[SkeletonTracing](tracingId, version).map(_.value)

  def findVersioned(tracingId: String, version: Option[Long] = None): Box[VersionedKeyValuePair[SkeletonTracing]] =
    tracingDataStore.skeletons.getJson[SkeletonTracing](tracingId, version)

  def findUpdated(tracingId: String, version: Option[Long] = None): Box[SkeletonTracing] =
    findVersioned(tracingId, version).flatMap(tracing => applyPendingUpdates(tracing, version))

  def save(tracing: SkeletonTracing) = tracingDataStore.skeletons.putJson(tracing.id, tracing.version, tracing)

  def saveUpdates(tracingId: String, updateActionGroups: List[SkeletonUpdateActionGroup]): Fox[List[Unit]] = {
    Fox.combined(for {
      updateActionGroup <- updateActionGroups
    } yield {
      tracingDataStore.skeletonUpdates.putJson(tracingId, updateActionGroup.version, updateActionGroup.actions)
    }.toFox)
  }

  def create(datSetName: String, parameters: CreateEmptyParameters): SkeletonTracing = {
    val id = createNewId()
    val tracing = SkeletonTracing(
      id = id,
      dataSetName = datSetName,
      trees = List(),
      timestamp = System.currentTimeMillis(),
      boundingBox = parameters.boundingBox,
      activeNodeId = None,
      scale = new Scale(1,1,1),
      editPosition = None,
      editRotation = None,
      zoomLevel = None,
      version = 0)
    save(tracing)
    tracing
  }

  def downloadNml(tracing: SkeletonTracing, dataSourceRepository: DataSourceRepository): Option[Enumerator[Array[Byte]]] = {
    for {
      dataSource <- dataSourceRepository.findUsableByName(tracing.dataSetName)
    } yield {
      Enumerator.outputStream { os =>
        NmlWriter.toNml(tracing, os, dataSource.scale).map(_ => os.close())
      }
    }
  }

  def downloadMultiple(params: DownloadMultipleParameters, dataSourceRepository: DataSourceRepository): Fox[TemporaryFile] = {
    val nmls:List[(Enumerator[Array[Byte]],String)] = for {
      tracingParams <- params.tracings
      tracingVersioned <- findVersioned(tracingParams.tracingId, tracingParams.version)
      tracingUpdated <- applyPendingUpdates(tracingVersioned, tracingParams.version)
      tracingAsNml <- downloadNml(tracingUpdated, dataSourceRepository)
    } yield {
      (tracingAsNml, tracingParams.outfileName)
    }

    for {
      zip <- createZip(nmls, params.zipfileName)
    } yield {
      zip
    }
  }

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

  def applyPendingUpdates(tracingVersioned: VersionedKeyValuePair[SkeletonTracing], desiredVersion: Option[Long]): Box[SkeletonTracing] = {
    val tracing = tracingVersioned.value
    val existingVersion = tracingVersioned.version
    val newVersion = findDesiredOrNewestPossibleVersion(desiredVersion, tracingVersioned)
    if (newVersion > existingVersion) {
      val pendingUpdates = findPendingUpdates(tracing.id, existingVersion, newVersion)
      val updatedTracing = update(tracing, pendingUpdates, newVersion)
      save(updatedTracing)
      Some(updatedTracing)
    } else {
      Some(tracing)
    }
  }

  private def findDesiredOrNewestPossibleVersion(desiredVersion: Option[Long], tracingVersioned: VersionedKeyValuePair[SkeletonTracing]): Long = {
    (for {
      newestUpdate <- tracingDataStore.skeletonUpdates.get(tracingVersioned.value.id)
    } yield {
      desiredVersion match {
        case None => newestUpdate.version
        case Some(desiredSome) => math.min(desiredSome, newestUpdate.version)
      }
    }).getOrElse(tracingVersioned.version) //if there are no updates at all, assume tracing was created from NML
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

  private def update(tracing: SkeletonTracing, updates: List[SkeletonUpdateAction], newVersion: Long): SkeletonTracing  = updates match {
    case List() => tracing
    case head :: tail => {
      def updateIter(tracing: SkeletonTracing, remainingUpdates: List[SkeletonUpdateAction]): SkeletonTracing = remainingUpdates match {
        case List() => tracing
        case update :: tail => updateIter(update.applyOn(tracing), tail)
      }
      val updated = updateIter(tracing, updates)
      updated.copy(version = newVersion)
    }
  }

  def duplicate(tracing: SkeletonTracing): Box[SkeletonTracing] = {
    val id = createNewId()
    val newTracing = tracing.copy(id = id, timestamp = System.currentTimeMillis(), version = 0)
    save(newTracing)
    Some(newTracing)
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

  def findMultipleUpdated(tracingSelectors: List[TracingSelector]): Fox[List[SkeletonTracing]] = {
    val boxes = tracingSelectors.map(selector => findUpdated(selector.tracingId, selector.version))
    Fox.combined(boxes.map(_.toFox))
  }

  def merge(tracings: List[SkeletonTracing]): SkeletonTracing = {
    tracings.reduceLeft(mergeTwo)
  }

  def extractAllFromZip(zipfile: Option[File]): Fox[List[SkeletonTracing]] = {
    zipfile match {
      case None => Fox.failure("Empty or No zipfile")
      case Some(file) => {
        val boxOfBoxes: Box[List[Box[SkeletonTracing]]] = ZipIO.withUnziped(file) {
          case (filePath, is) => {
            val nml = Source.fromInputStream(is).mkString
            NmlParser.parse(createNewId(), filePath.getFileName.toString, nml)
          }
        }
        boxOfBoxes match {
          case Full(tracings: List[Box[SkeletonTracing]]) =>
            Fox.combined(tracings.map(_.toFox))
          case _ => Fox.failure("Could not unpack zipfile")
        }
      }
    }
  }

}
