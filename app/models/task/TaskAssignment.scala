package models.task


import scala.concurrent.{ExecutionContext, Future}

import models.annotation.AnnotationService
import play.api.Play._
import models.user.{User, UserService}
import com.scalableminds.util.reactivemongo.DBAccessContext
import com.scalableminds.util.tools.{Fox, FoxImplicits}
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.iteratee._
import play.api.libs.concurrent.Execution.Implicits.{defaultContext => dec}

/**
 * Company: scalableminds
 * User: tmbo
 * Date: 19.11.13
 * Time: 14:57
 */
trait TaskAssignment extends FoxImplicits with LazyLogging{

  def findNextAssignment(user: User)(implicit ctx: DBAccessContext): Enumerator[OpenAssignment]

  def findAllAssignments(implicit ctx: DBAccessContext): Enumerator[OpenAssignment]

  val conf = current.configuration

  def logIfDeryaku(user: User)(s: String) = {
    if(user.email == "deryaku@hotmail.de")
      logger.error(s)
  }

  /**
   * Create an Enumeratee that filters the inputs using the given predicate
   *
   * @param predicate A function to filter the input elements.
   * $paramEcSingle
   */
  def filterM[U](user: User)(predicate: U => Future[Boolean])(implicit ec: ExecutionContext): Enumeratee[U, U] = new Enumeratee.CheckDone[U, U] {
    def step[A](k: K[U, A]): K[U, Iteratee[U, A]] = {

      case in @ Input.El(e) =>
        logIfDeryaku(user)("INPUT: " + in)
        Iteratee.flatten(predicate(e).map { b =>
          if (b) new Enumeratee.CheckDone[U, U] {def continue[A](k: K[U, A]) = Cont(step(k))} &> k(in)
          else Cont(step(k))
        }(dec))

      case in @ Input.Empty =>
        logIfDeryaku(user)("EMPTY!!!!!!")
        Cont(step(k))

      case Input.EOF =>
        logIfDeryaku(user)("INPUT EOF!!!!!!")
        Done(Cont(k), Input.EOF)
    }

    def continue[A](k: K[U, A]) = Cont(step(k))
  }

  def findAssignable(user: User)(implicit ctx: DBAccessContext) = {
    val alreadyDoneFilter = filterM[OpenAssignment](user){ assignment =>
      // TODO: remove
      logger.error(s"${user.email}: About to check for existance of tracing for ${assignment.id}")
      logIfDeryaku(user)(s"Checking for existance of tracing for ${assignment.id}")
      AnnotationService.findTaskOf(user, assignment._task).futureBox.map(_.isEmpty)
    }

    findNextAssignment(user)(ctx) &> alreadyDoneFilter
  }

  def findAllAssignableFor(user: User)(implicit ctx: DBAccessContext): Fox[List[OpenAssignment]] = {
    findAssignable(user) |>>> Iteratee.getChunks[OpenAssignment]
  }

  def findAssignableFor(user: User)(implicit ctx: DBAccessContext): Fox[OpenAssignment] = {
    findAssignable(user) |>>> Iteratee.head[OpenAssignment]
  }

  def allNextTasksForUser(user: User)(implicit ctx: DBAccessContext): Fox[List[Task]] =
    findAllAssignableFor(user).flatMap(assignments => Fox.sequenceOfFulls(assignments.map(_.task)))

  def nextTaskForUser(user: User)(implicit ctx: DBAccessContext): Fox[Task] =
    findAssignableFor(user).flatMap(_.task)
}
