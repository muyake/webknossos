package oxalis.view

import play.api.mvc.Flash
import models.user.User

trait FlashMessages{
  sealed trait FlashMessage{
    def message: String
    def messageType: String
  }
  
  case class FlashError(message: String) extends FlashMessage{
    def messageType = "error"
  }
  case class FlashWarn(message: String) extends FlashMessage{
    def messageType = "warn"
  }
  case class FlashSuccess(message: String) extends FlashMessage{
    def messageType = "success"
  }
}

trait SessionData{
  def userOpt: Option[User]
  def flash: Flash
}

case class UnAuthedSessionData(flash: Flash) extends SessionData {
  val userOpt = None
}
case class AuthedSessionData(user: User, flash: Flash) extends SessionData {
  val userOpt = Some(user)
}

object SessionData{
  def apply(user: Option[User], flash: Flash) = {
    user match{
      case Some(u) =>
        AuthedSessionData(u, flash)
      case _ =>
        UnAuthedSessionData(flash)
    }
  }
}