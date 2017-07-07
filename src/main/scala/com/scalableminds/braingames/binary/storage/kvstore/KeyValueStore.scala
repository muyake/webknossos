/*
 * Copyright (C) 2011-2017 Scalable minds UG (haftungsbeschränkt) & Co. KG. <http://scm.io>
 */
package com.scalableminds.braingames.binary.store.kvstore

import java.nio.file.Path

import com.scalableminds.util.mvc.BoxImplicits
import net.liftweb.common.Box
import play.api.libs.json._

import scala.concurrent.Future

case class KeyValuePair[T](key: String, value: T)

case class BackupInfo(id: String, timestamp: Long, size: Long)

object BackupInfo {
  implicit val backupInfoFormat = Json.format[BackupInfo]
}

trait KeyValueStore extends BoxImplicits {

  implicit protected def stringToByteArray(s: String): Array[Byte] = s.toCharArray.map(_.toByte)

  def get(columnFamily: String, key: String): Box[Array[Byte]]

  def scan(columnFamily: String, key: String, prefix: Option[String] = None): Iterator[KeyValuePair[Array[Byte]]]

  def put(columnFamily: String, key: String, value: Array[Byte]): Box[Unit]

  def getJson[T : Reads](columnFamily: String, key: String): Box[T] =
    get(columnFamily, key).flatMap(value => Json.parse(value).validate[T])

  def scanJson[T : Reads](columnFamily: String, key: String, prefix: Option[String] = None): Iterator[KeyValuePair[T]] = {
    scan(columnFamily, key, prefix).flatMap { pair =>
      Json.parse(pair.value).validate[T].asOpt.map(KeyValuePair(pair.key, _))
    }
  }

  def putJson[T : Writes](columnFamily: String, key: String, value: T): Box[Unit] =
    put(columnFamily, key, Json.toJson(value).toString)

  def backup(backupDir: Path): Box[BackupInfo]

  def close(): Future[Unit]
}
