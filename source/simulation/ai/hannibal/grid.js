/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, logObject */

/*--------------- G R I D S ---------------------------------------------------

  An API onto typed arrays, used for map analysis, path finding, attack planning
  can blur and other grahic methods

  tested with 0 A.D. Alpha 18 Rhododactylus
  V: 0.1.1, agentx, CGN, Mar, 2015

*/

HANNIBAL = (function(H){

  H.LIB.Grid = function(context){

    H.extend(this, {

      context: context,

      klass:    "grid",
      // parent:   context,
      // name:     context.name + ":grid:" + this.label, comes in initialize

      imports: [
        "map",         // width, height
        "mapsize",
        "effector",
        "entities",
      ],

      label:     "",  // human readable
      bits:      "",  // 8, 16, etc
      data:    null,  // typed Array
      width:      0,  // 
      height:     0,  // 
      length:     0,  // length = width * height
      cellsize: NaN   // factor to get positions

    });

  };

  H.LIB.Grid.prototype = H.mixin (

  /* internals
    */
    H.LIB.Serializer.prototype, {
    constructor: H.LIB.Grid,
    log: function(){
      var stats = this.stats();
      this.deb("   GRD: %s, min: %s, max: %s, stats: %s", H.tab(this.label, 12), this.min(), this.max(), H.prettify(stats));
    },    
    stats: function (){
      var stats = {}, i = this.length, data = this.data;
      while (i--){stats[data[i]] = stats[data[i]] ? stats[data[i]] +1 : 1;}
      return stats;
    },
    dump: function (comment, threshold){
      threshold = threshold || this.max() || 255;
      var filename = H.format("%s-%s-%s", this.label, comment || this.ticks, threshold);
      // deb("   GRD: dumping '%s', w: %s, h: %s, t: %s", name, this.width, this.height, threshold);
      this.effector.dumpgrid(filename, this, threshold);   
      return this; 
    },
    serialize: function(){
      return {
        label:    this.label,
        bits:     this.bits,
        bytes:    H.toRLE(this.data),
        size:     this.size,
        length:   this.length,
        cellsize: this.cellsize,
      };
    },
    deserialize: function(data){
      this.label =    data.label;
      this.bits =     data.bits;
      this.data =     H.fromRLE(data.bytes);
      this.size =     data.size;
      this.length =   data.length;
      this.cellsize = data.cellsize;
    },
    initialize: function(config){ // label, bits, grid, data, cellsize
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray

      this.label  = config.label || "anonymous grid";

      // specs incomplete
      if (!config.cellsize && !config.grid){
        H.throw("grid.initilaize: no cellsize");

      // copy grid
      } else if (config.grid && !config.data){
        this.cellsize = config.grid.cellsize;
        this.data     = new Uint8ClampedArray(config.grid.data);

      // clone grid
      } else if (config.grid && config.data){
        this.cellsize = config.grid.cellsize;
        this.data     = new Uint8ClampedArray(config.data);

      // all from config
      } else if (config.data){
        this.cellsize = config.cellsize;
        this.data     = new Uint8ClampedArray(config.data);
      
      // empty from specs
      } else {
        this.cellsize = config.cellsize;
        this.data     = new Uint8ClampedArray((this.mapsize / this.cellsize) * (this.mapsize / this.cellsize));
      
      }

      this.name   = this.context.name + ":grid:" + config.label || "grid" + this.context.idgen++;
      this.size   = this.mapsize / this.cellsize;
      this.length = this.size * this.size;
      this.bits   = "c8"; // config.bits || config.grid.bits || "c8";

      // this.deb("   GRD: init: %s cellsize: %s, size: %s, len: %s", 
      //   this.label,
      //   this.cellsize,
      //   this.size,
      //   this.length
      // );

      return this;
    },
    toArray: function(){
      return Array.prototype.slice.call(this.data);
    },
    tick: function(tick, secs){
      this.ticks = tick;
      this.secs  = secs;
    },

    copy: function(label){
      // new grid with same specs and same data
      return (
        new H.LIB.Grid(this.context)
          .import()
          .initialize({label: label, bits: this.bits, grid: this})
      );
    },

    clone: function(label, data){
      // new grid with same specs and given data
      return (
        new H.LIB.Grid(this.context)
          .import()
          .initialize({label: label, bits: this.bits, grid: this, data: data})
      );
    },

    read: function(label, data){
      this.data = new Uint8ClampedArray(data);
      return this;
    },

  /* information, debug

    */

    coordsWithinSize: function(x, y){
      var size = this.size;
      return [
        x < 0 ? 0 : x > size -1 ? size -1 : x,
        y < 0 ? 0 : y > size -1 ? size -1 : y,
      ];
    },
    indexToCoords: function(index){
      return [index % this.size, ~~(index / this.size)];
    },
    coordsToIndex: function(x, z){
      return x + z * this.size;
    },
    maxValue: function(){

      var 
        index = 0,
        value = 0,
        data  = this.data,
        i = this.length;
        
      while (i--) {
        if (data[i] > value){
          value = data[i];
          index = i;
        }
      } 

      return [this, value, this.map.gridIndexToMapPos(index, this), index];

    },    
    debIndex: function(index){

      // puts crossed lines on index for debugging

      var 
        x = this.size, 
        z = this.size,
        [cx, cz] = this.indexToCoords(index);

      while(x--){this.data[this.coordsToIndex(x, cz)] = (x % 2) ? 255 : 0;}
      while(z--){this.data[this.coordsToIndex(cx, z)] = (z % 2) ? 255 : 0;}

    },

  /* compute/alter grids

    */

    max:  function(){var m=0,   g=this.data,l=this.length;while(l--){m=(g[l]>m)?g[l]:m;}return m;},
    min:  function(){var m=1e10,g=this.data,l=this.length;while(l--){m=(g[l]<m)?g[l]:m;}return m;},
    set:  function(val){var g=this.data,l=this.length;while(l--){g[l] = val;}return this;},
    inv:  function(){var g=this.data,l=this.length;while(l--){g[l] = 255 - g[l];}return this;},

    markPositions: function(poss, key="wb"){

      var pattern = {
        "bw" : [0, 255, 255, 255, 255], // middle, up, right, down, left
        "wb" : [255, 0, 0, 0],
      }[key];

      poss.forEach(pos => {

        var [x, z] = this.map.mapPosToGridCoords(pos, this);

        this.data[this.coordsToIndex(x   , z   )] = pattern[0];
        this.data[this.coordsToIndex(x +1, z   )] = pattern[1];
        this.data[this.coordsToIndex(x   , z +1)] = pattern[2];
        this.data[this.coordsToIndex(x -1, z   )] = pattern[3];
        this.data[this.coordsToIndex(x   , z -1)] = pattern[4];

      });

      return this;

    },
    markEntities: function(ids, key="bw"){

      var pattern = {
        "bw" : [0, 255, 255, 255, 255],
        "wb" : [255, 0, 0, 0],
      }[key];

      ids.forEach(id => {

        var 
          ent = this.entities[id],
          pos = ent.position(),
          [x, z] = this.map.mapPosToGridCoords(pos, this);

        this.data[this.coordsToIndex(x   , z   )] = pattern[0];
        this.data[this.coordsToIndex(x +1, z   )] = pattern[1];
        this.data[this.coordsToIndex(x   , z +1)] = pattern[2];
        this.data[this.coordsToIndex(x -1, z   )] = pattern[3];
        this.data[this.coordsToIndex(x   , z -1)] = pattern[4];

      });

      return this;

    },

    process: function(fn){

      var 
        t0 = Date.now(),
        counter = 0, 
        i = this.length,
        data = this.data,
        size = this.size;

      // call fn with index, x, z, value
      while(i--){
        data[i] = fn( i, i % size, ~~(i / size), data[i]);
        counter += 1;
      }

      // this.deb("   GRD: %s %s process: %s", this.label, Date.now() - t0, H.fnBody(fn));

      return this;

    },

    filter: function( /* arguments */){

      var 
        t0    = Date.now(),
        args  = H.toArray(arguments),
        fn    = args.slice(-1)[0],
        // vars  = fn.length,
        datas = args.slice(0, -1).map(g => g.data),
        data  = this.data,
        len   = datas.length,
        i     = this.length;

      if (len === 0){
        while (i--) {data[i] = fn(data[i]);}
      } else if (len === 1){
        while (i--) {data[i] = fn(data[i], datas[0][i]);}
      } else if (len === 2){
        while (i--) {data[i] = fn(data[i], datas[0][i], datas[1][i]);}
      } else if (len === 3){
        while (i--) {data[i] = fn(data[i], datas[0][i], datas[1][i], datas[2][i]);}
      } else if (len === 4){
        while (i--) {data[i] = fn(data[i], datas[0][i], datas[1][i], datas[2][i], datas[3][i]);}
      } else if (len === 5){
        while (i--) {data[i] = fn(data[i], datas[0][i], datas[1][i], datas[2][i], datas[3][i], datas[4][i]);}
      } else if (len === 6){
        while (i--) {data[i] = fn(data[i], datas[0][i], datas[1][i], datas[2][i], datas[3][i], datas[4][i], datas[5][i]);}
      } else {
        H.throw("grid.filter: too many arguments");
      }

      // this.deb("   GRD: %s %s filter: %s", this.label, Date.now() - t0, H.fnBody(fn));

      return this;

    },
    processCircle: function(coords, radius, fn){

      // fills a circle into grid with value
      
      var 
        t0 = Date.now(),
        z = 0|0, x = 0|0, idx = 0|0, 
        r = radius, rr = r * r,
        len = this.length|0,
        size = this.size|0,
        data = this.data,
        [cx, cz] = coords;

      // hints
      cx=cx|0; cz=cz|0; r=r|0; rr=rr|0;

      for(z =-r; z<=r; z++){
        for(x=-r; x<=r; x++){
          if(x * x + z * z <= rr){

            idx = (cx + x) + size * (cz + z);
            if (idx >= 0 && idx < len){
              data[idx] = fn(data[idx]);
            }

          }
        }
      }

      // this.deb("   GRD: %s %s processCircle: radius: %s, %s", this.label, Date.now() - t0, radius, H.fnBody(fn));

      return this;

    }, 
  
  /* analysis

    */

    transform: function(data, x, y, w, min, max) {
      // lifted
      var g = data[x + y * w];
      if (g > min){data[x + y * w] = min;}
      else if (g < min){min = g;}
      if (++min > max){min = max;}
      return min;
    },
    distanceTransform: function() {

      // destructive, leaves black pixel untouched
      // all other have distance to nearest black

      var 
        t0 = Date.now(),
        data = this.data, 
        transform = this.transform,
        s = this.size,
        x = 0, y = 0, min = 0, max = 255;

      for ( y = 0; y < s; ++y) {
        min = max;
        for ( x = 0;     x <  s; ++x) {min = transform(data, x, y, s, min, max);}
        for ( x = s - 2; x >= 0; --x) {min = transform(data, x, y, s, min, max);}
      }
      for ( x = 0; x < s; ++x) {
        min = max;
        for ( y = 0;     y <  s; ++y) {min = transform(data, x, y, s, min, max);}
        for ( y = s - 2; y >= 0; --y) {min = transform(data, x, y, s, min, max);}
      }

      // this.deb("   GRD: %s %s distanceTransform", this.label, Date.now() - t0);

      return this;

    },
    setCoords: function(coords) {

      // destructive, computes the distance to coords up to 255
      // leaves pixel outside radius untouched

      var 
        t0 = Date.now(),
        x = 0, y = 0, dx = 0, dy = 0, r2 = 0,
        [cx, cy] = coords,
        data = this.data, 
        size = this.size,
        maxDist  = 256,
        maxDist2 = maxDist * maxDist,
        x0 = ~~(Math.max(0, cx - maxDist)),
        y0 = ~~(Math.max(0, cy - maxDist)),
        x1 = ~~(Math.min(size -1, cx + maxDist)),  
        y1 = ~~(Math.min(size -1, cy + maxDist));

      for ( y = y0; y < y1; ++y) {
        for ( x = x0; x < x1; ++x) {
          dx = x - cx; 
          dy = y - cy; 
          r2 = dx * dx + dy * dy;

          data[x + y * size] = ( r2 < maxDist2 ? 
            maxDist - Math.sqrt(r2) :
            255
          );
          // if (r2 < maxDist2) {
          //   data[x + y * size] = maxDist - Math.sqrt(r2);
          // } 
      }}

      // this.deb("   GRD: %s %s setCoords", this.label, Date.now() - t0);

      return this;

    },
    blur: function (radius){

      // http://blog.ivank.net/fastest-gaussian-blur.html
      // destructive

      var 
        t0 = Date.now(),
        target = Array.prototype.slice.call(this.data);
      
      boxBlur_4(this.data, target, this.width, this.height, radius);
      this.data = new Uint8ClampedArray(target);

      function boxBlur_4 (scl, tcl, w, h, r) {
        boxBlurH_4(tcl, scl, w, h, r);
        boxBlurT_4(scl, tcl, w, h, r);
      }
      function boxBlurH_4 (scl, tcl, w, h, r) {

          var i, j, ti, li, ri, fv, lv, val, iarr = 1 / (r+r+1);

          for (i=0; i<h; i++) {

            ti = i*w; li = ti; ri = ti+r;
            fv = scl[ti]; lv = scl[ti+w-1]; val = (r+1)*fv;

            for(j=0; j<r; j++) {
              val += scl[ti+j];
            }
            for(j=0  ; j<=r ; j++) { 
              val += scl[ri++] - fv;   
              tcl[ti++] = Math.round(val*iarr); 
            }
            for(j=r+1; j<w-r; j++) { 
              val += scl[ri++] - scl[li++];   
              tcl[ti++] = Math.round(val*iarr); 
            }
            for(j=w-r; j<w  ; j++) { 
              val += lv        - scl[li++];   
              tcl[ti++] = Math.round(val*iarr); 
            }
          }
      }
      function boxBlurT_4 (scl, tcl, w, h, r) {

          var i, j, ti, li, ri, fv, lv, val, iarr = 1 / (r+r+1);

          for(i=0; i<w; i++) {

            ti = i; li = ti; ri = ti+r*w;
            fv = scl[ti]; lv = scl[ti+w*(h-1)]; val = (r+1)*fv;

            for(j=0; j<r; j++) {
              val += scl[ti+j*w];
            }
            for(j=0  ; j<=r ; j++) { 
              val += scl[ri] - fv     ;  
              tcl[ti] = Math.round(val*iarr);  ri+=w; ti+=w; 
            }
            for(j=r+1; j<h-r; j++) { 
              val += scl[ri] - scl[li];  
              tcl[ti] = Math.round(val*iarr);  li+=w; ri+=w; ti+=w; 
            }
            for(j=h-r; j<h  ; j++) { 
              val += lv      - scl[li];  
              tcl[ti] = Math.round(val*iarr);  li+=w; ti+=w; 
            }
          }

      }

      this.deb("   GRD: %s %s blur: rad: %s", this.label, Date.now() - t0, radius);

      return this;

    },

  /* other

    */
    render: function (cvs, alpha=255, nozero=true){

      // greyscales grid in imagedata of canvas

      var
        i, p, c, image, target, source,
        len = this.length,
        ctx = cvs.getContext("2d");

      // alpha = alpha !== undefined ? alpha : 255;
      cvs.width = cvs.height = this.width;
      image  = ctx.getImageData(0, 0, this.width, this.height);
      target = image.data;
      source = this.data;

      for (i=0; i<len; i++){
        c = source[i];
        p = i * 4; 
        target[p] = target[p + 1] = target[p + 2] = c;
        target[p + 3] = nozero && !c ? 0 : alpha;
      }
      
      ctx.putImageData(image, 0, 0);

    },

  });

return H; }(HANNIBAL));


//       initTopo: function(){

//         var i, h, off, idx, x, y, len, iwidth = width +1, max = 0, min = 10e7;

//         self.topo = new H.Grid(width, height, 8);

//         if (isBrowser){

//           len = (iwidth) * (iwidth);
          
//           for (i=0, off=16; i<len; i++, off+=2) {
//             x = i % iwidth; y = ~~(i/iwidth);
//             if (x < width && y < height){
//               idx = (width - y) * width + x;
//               h = topoBuffer.getUint16(off, true) >> 8;
//               self.topo.data[idx] = h;
//               max = h > max ? h : max;
//               min = h < min ? h : min;
//             }
//           }
//           i = length; while(i--){
//             h = H.scale(self.topo.data[i], min, max, 0, 220);
//             self.topo.data[i] = h;
//           }

//         } else {
//           for (i=0; i<length; i++){
//             self.topo.data[i] = self.passability.data[i] >> 8; 
//           }

//         }

//       },
//       initPass: function(){

//         var i, cvs, ctx, source;

//         self.pass = new H.Grid(width, height, 8);

//         if (isBrowser){

//           cvs = document.createElement("canvas");
//           cvs.width = cvs.height = width;
//           ctx = cvs.getContext("2d");
//           ctx.drawImage(passImage, 0, 0, width, width, 0, 0, width, width);
//           source = ctx.getImageData(0, 0, width, width).data;

//           for (i=0; i<length *4; i+=4) {
//             self.pass.data[i >> 2] = source[i];
//           }

//         } else {

//           for (i=0; i<length; i++){
//             self.pass.data[i] = self.passability.data[i] >> 0; 
//           }

//         }

//       },
//       initProp: function(){

//         if (isBrowser){

//           self.prop = new H.Grid(width, height, 8);

//         } else {

//           self.prop = gridFromMap(H.Bot.gameState.ai.territoryMap);

//         }


//       },
//       initCost: function(){

//         var 
//           i = length, maskCost = 8 + 16 + 32 + 64,
//           grdTemp = new H.Grid(width, height, 8);

//         while(i--){
//           grdTemp.data[i] = self.terr.data[i] & maskCost ? 255 : 0;
//         }
//         self.cost = grdTemp.blur(3);

//       },
//       initTrees: function(){
//         // var i = length, s, t;
//         self.tree = new H.Grid(width, height, 8);
//       },
//       initTerrain: function(){

//         // pathfinderObstruction:1, 
//         // foundationObstruction:2, trees, mines
//         // building-land:4, 
//         // building-shore:8, 
//         // default:16, 
//         // ship:32, 
//         // unrestricted:64

//         var i = length, s, t;

//         self.terr = new H.Grid(width, height, 8);

//         while(i--){

//           s = self.pass.data[i];
//           t = (
//              (s &  1)                             ?   0 : //  dark red : pathfinder obstruction forbidden
//              (s & 16) && !(s & 32) &&   (s & 64) ?   4 : //  land
//             !(s & 16) && !(s & 32) &&   (s & 64) ?   8 : //  shallow
//             !(s & 16) && !(s & 32) &&  !(s & 64) ?  16 : //  mixed
//             !(s & 16) &&  (s & 32) &&  !(s & 64) ?  32 : //  deep water
//              (s & 16) &&  (s & 32) &&  !(s & 64) ?  32 : //  deep steep water, check with Azure Coast
//              (s & 16) &&  (s & 32) &&   (s & 64) ?  64 : //  red : land too steep
//             !(s & 16) &&  (s & 32) &&   (s & 64) ?  64 : //  red : land also too steep
//               255                                          // error
//           );
//           self.terr.data[i] = t;

//         }

//       },
//       analyzePoint: function(x, y){
//         var data = self.obstruction.data;
//         return (
//           (data[x + y * width]  === 0)   ? 255 :
//           (data[x + y * width]  === 255) ?  32 :
//           (data[x + y * width]  === 200) ? 128 :
//             200
//         );
//       },
//       analyzeLifted: function(dataScout, dataObst, x0, x1, y0, y1, cx, cy, radius, width){

//         var y = 0, x = 0, index = 0, dx = 0, dy = 0, r2 = 0;

//         for ( y = y0; y < y1; ++y) {
//           for ( x = x0; x < x1; ++x) {
//             dx = x - cx; dy = y - cy;
//             r2 = ~~Math.sqrt(dx * dx + dy * dy);
//             index = x + y * width;
//             if (dataScout[index] === 0 && r2 < radius){
//               dataScout[index] = (
//                 (dataObst[index] === 0)   ? 255 :
//                 (dataObst[index] === 255) ?  32 :
//                 (dataObst[index] === 200) ? 128 :
//                   200
//               );
//             }
//           }
//         }

//       },
//     // searchSpiral: function (xs, ys, expression){

//     //   // http://stackoverflow.com/questions/3330181/algorithm-for-finding-nearest-object-on-2d-grid

//     //   var d, x, y,
//     //       maxDistance = xs < width/2  ? width  - xs : xs,
//     //       checkIndex  = new Function("grid", "i", "return grid.data[i] " + expression + ";"),
//     //       checkPoint  = function(x, y){
//     //         if (x > 0 && y > 0 && x <= width && y <= height){
//     //           return checkIndex(this, x + y * width);
//     //         } else {return undefined;}
//     //       };

//     //   if (checkPoint(xs, ys)){return [xs, ys];}

//     //   for (d = 0; d<maxDistance; d++){
//     //     for (x = xs-d; x < xs+d+1; x++){
//     //       // Point to check: (x, ys - d) and (x, ys + d) 
//     //       if (checkPoint(x, ys - d)){return [x, ys - d];}
//     //       if (checkPoint(x, ys + d)){return [x, ys - d];}
//     //     }
//     //     for (y = ys-d+1; y < ys+d; y++)          {
//     //       // Point to check = (xs - d, y) and (xs + d, y) 
//     //       if (checkPoint(x, ys - d)){return [xs - d, y];}
//     //       if (checkPoint(x, ys + d)){return [xs - d, y];}
//     //     }
//     //   }

//     // },
//     findLowestNeighbor: function(posX, posY) {

//       // returns the point with the lowest radius in the immediate vicinity

//       var data  = this.data,
//           lowestPt = [0, 0],
//           lowestCf = 99999,
//           x = ~~(posX / 4),
//           y = ~~(posY / 4),
//           xx = 0, yy = 0;

//       for (xx = x -1; xx <= x +1; ++xx){
//         for (yy = y -1; yy <= y +1; ++yy){
//           if (xx >= 0 && xx < width && yy >= 0 && yy < width){
//             if (data[xx + yy * width] <= lowestCf){
//               lowestCf = data[xx + yy * width];
//               lowestPt = [(xx + 0.5) * 4, (yy + 0.5) * 4];
//       }}}} return lowestPt;

//     },
//     sumInfluence: function(cx, cy, radius){

//       var data  = this.data,
//           x0 = Math.max(0, cx - radius),
//           y0 = Math.max(0, cy - radius),
//           x1 = Math.min(width,  cx + radius),
//           y1 = Math.min(height, cy + radius),
//           radius2 = radius * radius,
//           sum = 0, y, x, r2, dx, dy;
      
//       for ( y = y0; y < y1; ++y) {
//         for ( x = x0; x < x1; ++x) {
//           dx = x - cx;
//           dy = y - cy;
//           r2 = dx*dx + dy*dy;
//           if (r2 < radius2){
//             sum += data[x + y * width];

//       }}} return sum;

//     },
//     addInfluence: function(cx, cy, maxDist, strength, type) {

//       var data = this.data, width = this.width, height = this.height,
//           maxDist2 = maxDist * maxDist,
//           r = 0.0, x = 0, y = 0, dx = 0, dy = 0, r2 = 0,
//           x0 = ~~(Math.max(0, cx - maxDist)),
//           y0 = ~~(Math.max(0, cy - maxDist)),
//           x1 = ~~(Math.min(width  -1, cx + maxDist)),   //??
//           y1 = ~~(Math.min(height -1, cy + maxDist)),
//           str = (
//             type === "linear"    ? (strength || maxDist) / maxDist  :
//             type === "quadratic" ? (strength || maxDist) / maxDist2 :
//               strength
//           ),
//           fnQuant = ( 
//             type === "linear"    ? (r) => str * (maxDist  - Math.sqrt(r)) :
//             type === "quadratic" ? (r) => str * (maxDist2 - r) : 
//               () => str
//           );

//       for ( y = y0; y < y1; ++y) {
//         for ( x = x0; x < x1; ++x) {
//           dx = x - cx; 
//           dy = y - cy; 
//           r2 = dx * dx + dy * dy;
//           if (r2 < maxDist2) {
//             data[x + y * width] += fnQuant(r2);

//       }}}

//     },
//     /**
//     // returns a count. It's not integer. About 2 should be fairly accessible already.
//     countConnected: function(startIndex, byLand){

//       var data = this.data, w = width,
//           count = 0.0, i = square2.length, index = 0, value = 0;

//       while (i--) {
//         index = startIndex + square2[i][0] + square2[i][1] * w;
//         value = data[index];
//         if (byLand && value !== 0) {
//           count += (
//             value ===   0 ? 0    :
//             value === 201 || value === 255 || value === 41 ? 1 :
//             value ===  42 ? 0.5  :
//             value ===  43 ? 0.3  :
//             value ===  44 ? 0.13 :
//             value ===  45 ? 0.08 :
//             value ===  46 ? 0.05 :
//             value ===  47 ? 0.03 :
//               0
//           );
//         } else if (!byLand && value !== 0) {
//           count += (
//             value ===   0 ? 0 :
//             value === 201 ? 1 :
//             value === 200 ? 1 :
//               0
//           );
//       }}

//       return count;
      
//     },
//     isAccessible: function(position, onLand){
//       var gamePos = H.Map.mapPosToGridPos(position);
//       return (this.countConnected(gamePos[0] + width * gamePos[1], onLand) >= 2);
//     }

//   };

// Object [unidentified] : ss.resourceMaps['food']  ---------------
// Object  constructor: (function Map(sharedScript, originalMap, actualCopy){"use st
//   cellSize: NUMBER (4)
//   height: NUMBER (256)
//   length: NUMBER (65536)
//   map: OBJECT [65536](0, 1, 2, 3, 4, ...)
//   maxVal: NUMBER (255)
//   width: NUMBER (256)
// Object.__proto__
//   add: (function (map){"use strict";  for (var i = 0; i < this.leng
//   addInfluence: (function (cx, cy, maxDist, strength, type) {"use strict";  
//   dumpIm: (function (name, threshold){"use strict";  name = name ? nam
//   expandInfluences: (function (maximum, map) {"use strict";  var grid = this.map
//   findBestTile: (function (radius, obstructionTiles){"use strict";  // Find 
//   findLowestNeighbor: (function (x,y) {"use strict";  var lowestPt = [0,0];  var l
//   mapPosToGridPos: (function (p){"use strict";  return [Math.floor(p[0]/this.ce
//   multiply: (function (map, onlyBetter, divider, maxMultiplier){"use str
//   multiplyInfluence: (function (cx, cy, maxDist, strength, type) {"use strict";  
//   point: (function (p){"use strict";  var q = this.mapPosToGridPos(p)
//   setInfluence: (function (cx, cy, maxDist, value) {"use strict";  value = v
//   setMaxVal: (function (val){"use strict";  this.maxVal = val; })
//   sumInfluence: (function (cx, cy, radius){"use strict";  var x0 = Math.max(



// Object [unidentified] : H.Bot.gameState.ai.territoryMap  ---------------
// Object  constructor: function Object() {    [native code]}
//   data: OBJECT [65536](0, 1, 2, 3, 4, ...)
//   height: NUMBER (256)
//   width: NUMBER (256)


// Object [unidentified] : sharedScript.passabilityClasses  ---------------
// Object  constructor: function Object() {    [native code]}
//   pathfinderObstruction: NUMBER (1)
//   foundationObstruction: NUMBER (2)
//   building-land: NUMBER (4)
//   building-shore: NUMBER (8)
//   default: NUMBER (16)
//   ship: NUMBER (32)
//   unrestricted: NUMBER (64)


// Object [Object] : attributes: 9, comment: sharedScript.passabilityClasses
//   building-land: NUMBER (1)
//   building-shore: NUMBER (2)
//   default: NUMBER (4)
//   default-terrain-only: NUMBER (8)
//   large: NUMBER (16)
//   ship: NUMBER (32)
//   ship-small: NUMBER (64)
//   ship-terrain-only: NUMBER (128)
//   unrestricted: NUMBER (256)
