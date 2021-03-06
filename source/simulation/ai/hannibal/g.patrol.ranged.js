/*jslint bitwise: true, browser: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL */

/*--------------- GROUP:  P A T R O L  ----------------------------------------

  a group to control and observe a settlment


  tested with 0 A.D. Alpha 18 Rhododactylus
  V: 0.1.1, agentx, CGN, Mar, 2015

*/


HANNIBAL = (function(H){

  H.extend(H.Groups, {

    "g.patrol.ranged" : {

      /* Behaviour: 
        village swat team
        relaxes on no attack
        attacks attacker
        concentrates on success hits
        flees enemies to strong
      */

      // variables available in listener with *this*. All optional

      active:         true,           // ready to init/launch ...
      description:    "patrol",       // text field for humans 
      civilisations:  ["*"],          // lists all supported cics
      interval:       2,              // call onInterval every x ticks

      scripts: {


        launch: function launch (w, config) {

          var path, pos = w.group.position[0] + " " + w.group.position[1];

          w.units       = ["exclusive", "archer CONTAIN"];
          w.units.size  = config.size || 16;

          path          = w.units.size + "; translate " + pos + "; circle 30";
          w.path        = ["path", path];
          w.path.size   = w.units.size;

          w.nounify("units", "path");
          w.path.on.request();   


        }, assign: function assign (w, item) {

          // a request was succesful

          // w.deb("     G: assign.0: %s, %s", w, item);

          w.nounify("item", item);

          // got path, request all units, exits
          w.path.on
            .member(w.item)
            .units.do.request(w.units.size)
            .exit
          ;

          // have too much units, exits
          w.units.on
            .gt(w.units.count, w.units.size)
            .release(w.item)
            .exit
          ;         

          // got a unit, send to path start
          w.units.on
            .member(w.item)
            .stance("passive")
            .item.do.move(w.path.points("0"))
            .group.do.format("Box")
          ;

          //  got final unit, spread them over path
          w.units.on
            .member(w.item)
            .match(w.units.count, w.units.size)
            .spread(w.path) 
          ;

  
        }, destroy: function destroy (w, item) {

          // resource lost

          w.nounify("item", item);

          // lost unit, request another, go mad
          w.units.on
            .member(w.item)
            .request()
            .stance("agressive")
          ;


        }, attack: function attack (w, attacker, victim, type, damage){

          w.deb("     G: attack: %s, %s, %s", this, attacker, victim);

          w.nounify("attacker",  attacker, "victim", victim);

          // we hit someone, I'm good
          w.units.on
            .member(w.attacker)
            .stance("denfensive")
            .path.do.modify("center E" + w.attacker.id)
            .spread(w.path)
          ;

          // someone hit us
          w.units.on
            .member(w.victim)
            .stance("denfensive")
            .lt(w.units.count, w.units.size -4)
            .flee()
          ;


        }, release: function release (w, item) {

          // de-garrison

          w.deb("     G: release.0: %s, %s", w, item);


        }, radio: function radio (w, source, msg){

          // group radio

          w.deb("     G: %s onBroadcast from: %s, msg: %s", this, source, msg);


        }, interval: function interval (w, tick, secs){

          // w.deb("     G: interval: %s, secs: %s, intv: %s", this, secs, this.interval);

          //  if complete and idle, change path and spread
          
          w.units.on
            .match(tick % 4, 0)
            .doing("idle")
            .match(w.units.count, w.units.size)
            .stance("passive")
            .spread(w.path)
            .path.do.modify("rotate 120")
          ;

          w.units.on
            .match(tick % 4, 2)
            .doing("idle")
            .match(w.units.count, w.units.size)
            .stance("passive")
            .spread(w.path)
            .path.do.modify("rotate 20")
          ;

        }


      } // end scripts

    }

  });

return H; }(HANNIBAL));
