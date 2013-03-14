package brainflight.format

import java.util.Date
import java.util.GregorianCalendar
import java.text.SimpleDateFormat
import java.util.TimeZone
import org.bson.types.ObjectId
import scala.concurrent.duration.Duration

trait Formatter{
  def formatDate(timestamp: Long): String = 
    formatDate(new Date(timestamp))
  
  def formatDate(date: Date) = {
    val cal = new GregorianCalendar(TimeZone.getTimeZone("GMT+1"))
    val sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm")
    sdf.setCalendar(cal)
    cal.setTime(date)
    sdf.format(date)
  }

  def formatHash(id: String): String = {
    id.takeRight(6)
  }

  def formatHash(id: ObjectId): String = {
    formatHash(id.toString)
  }

  def formatTimeHumanReadable(time: Duration) = {
    "%dh %dm".format(time.toHours, (time.toMinutes % 60) / 5 * 5)
  }
  
  def formatShortText(text: String, maxLength: Int = 100) = {
    if(text.length() > maxLength && maxLength > 4){
      text.substring(0, maxLength - 4) + " ..."
    } else {
      text
    }
  }
}
