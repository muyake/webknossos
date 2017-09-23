/*
* Copyright (C) 2011-2017 scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
*/
package com.scalableminds.braingames.datastore.controllers

import com.google.inject.Inject
import com.scalableminds.braingames.binary.helpers.DataSourceRepository
import com.scalableminds.braingames.datastore.SkeletonTracing.{SkeletonTracing, SkeletonTracings}
import com.scalableminds.braingames.datastore.VolumeTracing.{VolumeTracing, VolumeTracings}
import com.scalableminds.braingames.datastore.services.WebKnossosServer
import com.scalableminds.braingames.datastore.tracings.volume.{VolumeTracingService, VolumeUpdateAction, VolumeUpdateActionGroup}
import com.scalableminds.braingames.datastore.tracings._
import com.scalableminds.util.tools.Fox
import play.api.i18n.{Messages, MessagesApi}
import play.api.libs.json.Json
import play.api.mvc.Action

import scala.concurrent.ExecutionContext.Implicits.global

class VolumeTracingController @Inject()(
                                         val tracingService: VolumeTracingService,
                                         val dataSourceRepository: DataSourceRepository,
                                         val webKnossosServer: WebKnossosServer,
                                         tracingDataStore: TracingDataStore,
                                         val messagesApi: MessagesApi
                                       ) extends TracingController[VolumeTracing, VolumeTracings, VolumeUpdateActionGroup] {

  implicit val tracingsCompanion = VolumeTracings

  implicit def packMultiple(tracings: List[VolumeTracing]): VolumeTracings = VolumeTracings(tracings)

  implicit def unpackMultiple(tracings: VolumeTracings): List[VolumeTracing] = tracings.tracings.toList

  implicit val updateReads = VolumeUpdateActionGroup.volumeUpdateActionGroupReads

  def initialData(tracingId: String) = Action.async {
    implicit request =>
      AllowRemoteOrigin {
        for {
          initialData <- request.body.asRaw.map(_.asFile) ?~> Messages("zipFile.notFound")
          tracing <- tracingService.find(tracingId) ?~> Messages("tracing.notFound")
          _ <- tracingService.initializeWithData(tracing, initialData)
        } yield Ok(Json.toJson(TracingReference(tracingId, TracingType.volume)))
      }
  }

  def update(tracingId: String) = Action.async(validateJson[List[VolumeUpdateActionGroup]]) {
    implicit request => {
      AllowRemoteOrigin {
        withAuthorizedUpdate(tracingId, request.body) { updates =>
          Fox.successful(())
          //tracingService.applyUpdates(tracing, updates)
        }.map(_ => Ok)
      }
    }
  }

  def getData(tracingId: String, version: Option[Long]) = Action.async {
    implicit request => {
      AllowRemoteOrigin {
        for {
          tracing <- tracingService.find(tracingId) ?~> Messages("tracing.notFound")
        } yield {
          Ok.chunked(tracingService.data(tracing))
        }
      }
    }
  }
}
