/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb */

/*--------------- G E O M E T R Y ---------------------------------------------

  Deals with points, rectangke, circles, polygons


  tested with 0 A.D. Alpha 18 Rhododactylus
  V: 0.1.1, agentx, CGN, Mar, 2015

*/


HANNIBAL = (function(H){

  var 
    PIH = Math.PI / 2,
    PI2 = Math.PI * 2;

  H.Geometry.Point = function (x, y){
    this.x = x;
    this.y = y;
  };
  H.Geometry.Point.prototype = {
    constructor: H.Geometry.Point,
    distance: function (point){
      var 
        dx = point.x - this.x,
        dy = point.y - this.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
  };

  H.Geometry.Rect = function (x, y, w, h, a){
    this.corners = null;
    this.x       = x !== undefined ? x : 20; // center
    this.y       = y !== undefined ? y : 30;
    this.center  = new H.Geometry.Point(this.x, this.y);
    this.theta   = a !== undefined ? a : 0;
    this.width   = w !== undefined ? w : 150;
    this.height  = h !== undefined ? h : 100;
    this.w2 = this.width  / 2;
    this.h2 = this.height / 2;
    this.rotate();
  };
  H.Geometry.Rect.prototype = {
    constructor: H.Geometry.Rect,
    polygon: function () {
      return this.corners;
    },
    intersects: function(rect){
      return H.Geometry.doPolygonsIntersect(this.polygon(), rect.polygon());
    },
    rotatePoint: function(x, y){
      return {
        x: this.cos * (x-this.x) - this.sin * (y-this.y) + this.x,
        y: this.sin * (x-this.x) + this.cos * (y-this.y) + this.y
      };
    },
    rotate: function(a){
      this.theta   = (this.theta + (a || 0)) % (PI2);
      this.sin     = Math.sin(this.theta);
      this.cos     = Math.cos(this.theta);
      this.corners = this.points();
      this.cornersplus = this.corners.concat(this.corners[0]);
    },
    points: function(){
      var w2 = this.width/2, h2 = this.height/2, x = this.x, y = this.y;
      return [
        this.rotatePoint(x + w2, y + h2),
        this.rotatePoint(x + w2, y - h2),
        this.rotatePoint(x - w2, y - h2),
        this.rotatePoint(x - w2, y + h2),
      ];
    },
    contains: function(point){
      var 
        dx = point.x - this.x,
        dy = point.y - this.y,
        dist = Math.sqrt(dx * dx + dy * dy),
        angle = Math.atan2(dy, dx) - this.theta,
        x = Math.cos(angle) * dist,
        y = Math.sin(angle) * dist;
      return (x > -this.w2 && x < this.w2 && y > -this.h2 && y < this.h2);
    },

    containsX: function(p0){
      // http://mathforum.org/library/drmath/view/54386.html
      var i, p1, p2, v = 0, hit = true, d = [];
      for (i=0; i<4; i++){
        p1 = this.cornersplus[i];
        p2 = this.cornersplus[i +1];
        v = ( p0.y - p1.y - ( p2.y - p1.y ) / ( p2.x - p1.x ) ) * ( p0.x - p1.x );
        d.push(v);
        hit = hit && v < 0 ? true : false;
      }
      return hit;
    },
    draw: function(ctx, strokeColor, width, fillColor=""){
      var corners = this.corners;
      ctx.lineWidth   = width || 1;
      ctx.strokeStyle = strokeColor || "rgba(200, 200, 200, 0.8)";
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.lineTo(corners[0].x, corners[0].y);
      ctx.stroke();
      if (fillColor){
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.fillStyle = "rgba(200, 0, 0, 0.8)";
      ctx.fillRect(corners[0].x -1, corners[0].y -1, 2, 2);
    }
  };

  H.Geometry.Circle = function (x, y, radius){
    this.x = x;
    this.y = y;
    this.radius = radius;
  };
  H.Geometry.Circle.prototype = {
    constructor: H.Geometry.Circle,
    polygon: function (n) {
      var out = [], s = (PI2)/n;
      while (n--){
        out.push({
          x: this.x + Math.cos(n * s) * this.radius,
          y: this.y + Math.sin(n * s) * this.radius
        });
      }
      return out;
    },
  };


  /*
    creates an array of n vertices all located on a circle with same distance

  */

  H.Geometry.polygonFromCircle = function(x, y, radius, n){

    var out = [], s = (Math.PI * 2)/n;

    while (n--){
      out.push({
        x: x + Math.cos(n * s) * radius,
        y: y + Math.sin(n * s) * radius
      });
    }

    return out;

  };

  /**
   * http://stackoverflow.com/questions/10962379/how-to-check-intersection-between-2-rotated-rectangles/12414951#12414951
   * Helper function to determine whether there is an intersection between the two polygons described
   * by the lists of vertices. Uses the Separating Axis Theorem
   *
   * @param a an array of connected points [{x:, y:}, {x:, y:},...] that form a closed polygon
   * @param b an array of connected points [{x:, y:}, {x:, y:},...] that form a closed polygon
   * @return true if there is any intersection between the 2 polygons, false otherwise
   */

  H.Geometry.doPolygonsIntersect = function (a, b) {

    var 
      polygons = [a, b],
      aLen = a.length, bLen = b.length, pLen, 
      minA, maxA, projected, i, i1, j, minB, maxB,
      polygon, i2, p1, p2, normX, normY; 

    for (i = 0; i < polygons.length; i++) {

      // for each polygon, look at each edge of the polygon, 
      // and determine if it separates the two shapes

      polygon = polygons[i];
      pLen = polygon.length;

      for (i1 = 0; i1 < pLen; i1++) {

        // grab 2 vertices to create an edge

        i2 = (i1 + 1) % pLen;
        p1 = polygon[i1];
        p2 = polygon[i2];

        // find the line perpendicular to this edge
        normX = p2.y - p1.y;
        normY = p1.x - p2.x;

        minA = maxA = undefined;

        // for each vertex in the first shape, project it onto the line perpendicular to the edge
        // and keep track of the min and max of these values
        
        for (j = 0; j < aLen; j++) {

          projected = normX * a[j].x + normY * a[j].y;

          minA = (minA === undefined || projected < minA) ? projected : minA;
          maxA = (maxA === undefined || projected > maxA) ? projected : maxA;

        }

        minB = maxB = undefined;

        // for each vertex in the second shape, project it onto the line perpendicular to the edge
        // and keep track of the min and max of these values

        for (j = 0; j < bLen; j++) {

          projected = normX * b[j].x + normY * b[j].y;

          minB = (minB === undefined || projected < minB) ? projected : minB;
          maxB = (maxB === undefined || projected > maxB) ? projected : maxB;

        }

        // if there is no overlap between the projects, the edge we are looking at separates the two
        // polygons, and we know there is no overlap

        if (maxA < minB || maxB < minA) {
          return false;
        }

      }
    }

    return true;

  };

return H; }(HANNIBAL));     
