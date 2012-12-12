package models.graph

import brainflight.tools.geometry.Point3D
import xml.XMLWrites

case class Node(id: Int, radius: Float, position: Point3D, viewport: Int, resolution: Int, timestamp: Long)

object Node {
  implicit object NodeXMLWrites extends XMLWrites[Node] {
    def writes(n: Node) =
      <node id={ n.id.toString } radius={ n.radius.toString } x={ n.position.x.toString } y={ n.position.y.toString } z={ (n.position.z).toString } inVp={ n.viewport.toString } inMag={ n.resolution.toString } time={ n.timestamp.toString }/>
  }
}