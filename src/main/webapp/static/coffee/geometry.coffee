class Geometry
  constructor: ->
    @polyhedral = []
  
  load: (_polyhedral) ->
    
    vertices = new Vertex3Set
    edges = new Edge3Set
    faces = []
    
    for _polygon in _polyhedral
      
      face_vertices = for el in _polygon
        vertices.add Vertex3.fromArray el
        
      face_edges = for i in [0...face_vertices.length]
        edges.add new Edge3 face_vertices[i], face_vertices[(i + 1) % face_vertices.length]
      
      faces.push new Face3(face_vertices, face_edges)
    
    @polyhedral.push new Polyhedron faces, vertices, edges
    
  
  ccw = (p1, p2, p3) ->
    (p2.dx - p1.dx) * (p3.dy - p1.dy) - (p2.dy - p1.dy) * (p3.dx - p1.dx)
  
  class Monotonizer
    constructor: (@polygon) ->
      @edges = new Edge3Set
      for i in [0...@polygon.length]
        @edges.add new Edge3 @polygon[i].original, @polygon[(i + 1) % @polygon.length].original
      
      @sweep_status = new Edge2Set
      @edges_to_remove = []
      
      @edge_function = (e, y) ->
        (-(e[0].dx * (e[1].dy - y) - e[1].dx * (e[0].dy - y)) / (e[0].dy - e[1].dy))
      
      @edge_compare = (a, b) -> (a[0].compare b[0]) or (a[1].compare b[1])
    
    run: ->
      
      return [@polygon] if @polygon.length <= 4
      
      # @polygon = Geometry.translateToXY(@polygon) unless @polygon[0].dx?
      @polygon.sort (a,b) -> a.compare b
      
      @current_y = @polygon[0].dy
      first_i_y = 0
      
      # do the sweep
      for _v, _i in @polygon
        
        _v._adjacents = [_v.adj0, _v.adj1]
        
        continue if _v.dy == @current_y
        
        # first pass
        # add edges to sweep_status
        @edges_to_remove = []
        
        for i in [first_i_y..._i]
          
          v = @polygon[i]
          for adj in v._adjacents
            if (adj.compare v) > 0
              @sweep_status.add [v, adj]
            else
              @edges_to_remove.push [adj, v]
         
        
        # second pass
        # if the vertex has an edge left and right to it
        # we need to regularize it
        for i in [first_i_y..._i]
          v = @polygon[i]
          incoming = outgoing = 0
          
          for adj in v._adjacents
            if (adj.compare v) > 0
              outgoing += 1
            else
              incoming += 1
          
          unless (outgoing >= 1 or i == @polygon.length - 1) and (incoming >= 1 or i == 0)
            left_edge = right_edge = null
            left_x = right_x = null
          
            for edge in @sweep_status.all()
              if edge[0] != v and edge[1] != v 
                
                edge_x = @edge_function(edge, v.dy)
                if edge_x < v.dx and (not left? or edge_x > left[1])
                  left_edge = edge
                  left_x = edge_x
                else if not right? or edge_x < right[1]
                  right_edge = edge
                  right_x = edge_x
            
            if left_edge? and right_edge?
              
              if outgoing < 1
                if left_edge[1].dy < right_edge[1].dy
                  @addDiagonal_(v, left_edge[1])
                else
                  @addDiagonal_(v, right_edge[1])
              
              if incoming < 1
                if left_edge[0].dx > right_edge[0].dx
                  @addDiagonal_(left_edge[0], v)
                else
                  @addDiagonal_(right_edge[0], v)
                  
        
        # third pass
        # remove edges from 
        @sweep_status.remove e for e in @edges_to_remove

        first_i_y = _i
        @current_y = _v.dy
      
      output = []

      for v in @polygon
        output.push v.polygon if output.indexOf(v.polygon) == -1
      
      output
    
    addDiagonal_: (a, b) ->
      @edges.add new Edge3 a.original, b.original
      
      @sweep_status.add [a, b]
      @edges_to_remove.push [a, b] if b.dy == @current_y

      a._adjacents.push b
      b._adjacents.push a
      
      _a = a.clone()
      _b = b.clone()
      
      sub0 = [a, b]
      v = b.adj0
      while v != a
        v.polygon = sub0
        sub0.push v
        v = v.adj0
      
      sub1 = [_a, _b]
      v = b.adj1
      while v != a
        v.polygon = sub1
        sub1.push v
        v = v.adj1
      
      a.polygon = b.polygon = sub0
      _a.polygon = _b.polygon = sub1
      
      if a.adj0 == sub0[sub0.length - 1]
        a.adj1 = b
        b.adj0 = a
        _a.adj0 = _b
        _b.adj1 = _a
      else
        a.adj0 = b
        b.adj1 = a
        _a.adj1 = _b
        _b.adj0 = _a
    
  @monotonize: (polygon) ->
    new Monotonizer(polygon).run()

  @triangulateMonotone: (polygon) ->
    
    return [polygon] if polygon.length == 3
    
    edges = new Edge3Set
    
    for i in [0...polygon.length]
      edges.add new Edge3 polygon[i].original, polygon[(i + 1) % polygon.length].original
    
    is_reflex = (v) ->
      v.reflex = ccw(v.adj0, v, v.adj1) >= 0
      
    remove_links = (v_old) ->
      v0 = v_old.adj0
      v1 = v_old.adj1
      
      if v0.adj0 == v_old
        v0.adj0 = v1
      else
        v0.adj1 = v1
        
      if v1.adj0 == v_old
        v1.adj0 = v0
      else
        v1.adj1 = v0
    
    output = []
      
    polygon.sort (a, b) -> a.compare b
    
    stack = []
    
    # assumes ccw ordering of vertices
    for v in polygon[2..-1]
      unless is_reflex(v)
        stack.push v
        
    while stack.length > 0
      v = stack.shift()
      
      v0 = v.adj0
      v1 = v.adj1
      output.push [v0, v, v1]
      
      edges.add new Edge3 v0.original, v1.original
      
      remove_links v
      
      v0_reflex = v0.reflex
      v1_reflex = v1.reflex
      
      stack.push v0 if not is_reflex(v0) and v0_reflex
      stack.push v1 if not is_reflex(v1) and v1_reflex
        
    output
    
  @triangulate: (polygon) ->
    monotones = Geometry.monotonize @toFace2.vertices
    triangles = []
    for monotone in monotones 
      triangles.push (Geometry.triangulateMonotone monotone)...
    triangles
  
  @overlaps: (ex1, ex2) ->
    
    overlaps2d(ex1, ex2) and
    ex1.min[2] < ex2.max[2] and
    ex1.max[2] > ex2.min[2]
  
  @overlaps2d: (ex1, ex2) ->
    ex1.min[0] < ex2.max[0] and
    ex1.max[0] > ex2.min[0] and
    ex1.min[1] < ex2.max[1] and
    ex1.max[1] > ex2.min[1]
  
  @calcExtent: (vertices) ->
    max = min = vertices[0].toArray()
    for i in [1...vertices.length]
      v = vertices[i]
      max = [Math.max(v.x, max[0]), Math.max(v.y, max[1]), Math.max(v.z, max[2])]
      min = [Math.min(v.x, min[0]), Math.min(v.y, min[1]), Math.min(v.z, min[2])]
    
    min: min
    max: max
  
  split: (p1, p2) ->
    if @overlaps(p1.extent, p2.extent)
      for face1 in p1.faces
        if @overlaps(face1.extent, p2.extent)
          for face2 in p2.faces
            if @overlaps(face1.extent, face2.extent)
              @find_intersections(face1, face2)
  
  find_intersections: (face1, face2) ->
      
    distance_vertex_to_plane = (vertex, plane) ->
      if plane[3] < 0
        (vertex.x * (-plane[0]) + vertex.y * (-plane[1]) + vertex.z * (-plane[2])) + plane[3]
      else
        (vertex.x * plane[0] + vertex.y * plane[1] + vertex.z * plane[2]) - plane[3]
      
    distance_vertices_to_plane = (vertices, plane) ->
      for vertex in vertices
        s = distance_vertex_to_plane(vertex, plane)
        if max? and min?
          max = Math.max(max, s)
          min = Math.min(min, s)
        else
          max = min = s
      [max, min]
    
    line_segment = (_face1, _face2) ->
      points = []
      
      for v in _face1.vertices
        points.push v if distance_vertex_to_plane(v, _face2.plane) == 0
      
      return points if points.length == 2
      
      for e in _face1.edges
        v1 = e.vertices[0]
        v2 = e.vertices[1]
        d1 = distance_vertex_to_plane(v1, _face2.plane)
        d2 = distance_vertex_to_plane(v2, _face2.plane)
        
        if (d1 < 0 < d2) or (d1 > 0 > d2)
          d1 = Math.abs(d1)
          d2 = Math.abs(d2)
          vec = v2.sub(v1)
          quotient = (d1 / (d1 + d2))
          
          vertex = new Vertex [
            v1.x + quotient * vec[0]
            v1.y + quotient * vec[1]
            v1.z + quotient * vec[2]
          ]
          vertex.polyhedron = _face1.polyhedron
          vertex.interior = false unless e.interior
          vertex.linked_edge = e
          points.push vertex
      
      return points
      
    line_segment_intersection = (seg1, seg2) ->
      
      p = seg1[0]
      
      d1 = 0
      d2 = Math.vecLength(seg1[1].sub(p))
      d3 = Math.vecLength(seg2[0].sub(p))
      d4 = Math.vecLength(seg2[1].sub(p))
      
      if d1 > d2
        [d1, d2] = [d2, d1]
      if d3 > d4
        [d3, d4] = [d4, d3]
      
      if d3 > d2 # both segments don't intersect
        return [] 
      if d2 == d3 # they only touch in one point
        return [seg1[1]]
        
      [
        if d3 <= d1
          seg1[0]
        else # d1 < d3 < d2
          seg2[0]
       ,
        if d4 <= d2
          seg2[1]
        else # d3 < d2 < d4
          seg1[1]
      ]
      
      
    
    [max, min] = distance_vertices_to_plane(face1.vertices, face2.plane)
    
    if (max >= 0 and min >= 0) or (max <= 0 and min <= 0)
      return false # coplanar or no intersection at all
    else
      [max, min] = distance_vertices_to_plane(face2.vertices, face1.plane)
      
      if (max >= 0 and min >= 0) or (max <= 0 and min <= 0)
        return false # still no intersection
      else
        
        line_segment_intersection(
          line_segment(face1, face2),
          line_segment(face2, face1)
        )

  @translateToXY: (vertices, normal) ->
    
    unless normal?
      normal = Math.crossProduct(vertices[1].sub(vertices[0]), vertices[2].sub(vertices[0]))
    
    set = new Vertex2Set()
    for v in vertices
      set.add v.toVertex2 normal
    
    for v in set.all()
      i = 0
      for adj in v.original.adjacents.all()
        v["adj#{i++}"] = set.get(adj.toVertex2 normal) if Math.dotProduct(adj.sub(v.original), normal) == 0
    
    set.all()
      
  