/*jslint bitwise: true, browser: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb */

/*--------------- P L U G I N S -----------------------------------------------





  V: 0.1, agentx, CGN, Feb, 2014

*/


HANNIBAL = (function(H){

  H.Plugins = H.Plugins || {};

  H.extend(H.Plugins, {

    "g.harvester" : {

      /* Behaviour: 
          to maintain one field resource (food.grain), 
          to return gathered food to dropsite
          to shelter from violence (garrison)
          to help with nearby repair
      */

      // variables available in listener with *this*. All optional

      active:         true,           // ready to init/launch ...
      description:    "harvester",    // text field for humans 
      civilisations:  ["*"],          // lists all supported cics

      interval:       10,             // call onInterval every x ticks
      parent:         "",             // inherit useful features

      capabilities:   "2 food/sec",   // (athen) give the economy a hint what this group provides.


      // this got initialized by launcher
      position:       null,           // coords of the group's position/activities

      // ASSETS
      // either trained or build or researched or claimed
      // make sure units can construct, repair and work on assets
      // dynamic: merely an updateable list (e.g. the current centre, shelter)
      // shared: needed, but shared with other groups (e.g. dropsites, temples)
      // exclusive: fully managed by this group (e.g. fields, units)

      units:          ["exclusive", "food.grain GATHEREDBY WITH costs.metal = 0, costs.stone = 0, costs.wood = 0 SORT < costs.food"],
      field:          ["exclusive", "food.grain PROVIDEDBY"],
      dropsite:       ["shared",    "food ACCEPTEDBY"],
      shelter:        ["dynamic",   "<units> MEMBER DISTINCT HOLDBY INGAME WITH slots >= 1"],

      // groups can claim space for structures or activities
      space:          [1, {width: 30, depth: 30, near: "<dropsite>"}],


      // message queue sniffer

      listener: {

        // game started, something launched this group
        onLaunch: function(ccid, size){

          this.size = size;
          this.register("dropsite", "units", "field", "shelter");     // turn res definitions into res objects
          this.economy.request(1, this.dropsite, this.position);      // assuming a CC exists

        },

        // a request was succesful
        onAssign: function(asset){

          // logObject(asset, "onAssign: " + this.name);

          deb("     G: %s onAssign ast: %s as '%s' res: %s", this, asset, asset.property, asset.resources[0]);

          if (this.dropsite.match(asset)){
            this.position = asset;
            this.economy.request(1, this.units);

          } else if (this.field.match(asset)){
            this.position = asset;
            if (asset.isFoundation){this.units.repair(asset);}
            if (asset.isStructure){this.units.gather(asset);}

          } else if (this.units.match(asset)){

            if (!this.field.isRequested){ 
              // this.economy.request(4, this.units);
              this.economy.request(1, this.field, this.dropsite);

            } else if (this.field.isFoundation){
              // may silently fail, because field was destroyed
              asset.repair(this.field);

            } else if (this.field.isStructure){
              asset.gather(this.field);

            }

            if (this.units.count < this.size){
              this.economy.request(1, this.units, this.position);   
            }            

          } else {
            deb("     G: %s unidentified asset: %s, shared: %s", this, asset, asset.shared);

          }

        },

        // resource lost
        onDestroy: function(asset){

          deb("     G: %s onDestroy: %s", this, asset);

          if (this.field.match(asset)){
            this.position = this.units;
            
            // postpone one tick, because field was just destroyed this tick (terrain conflict)
            this.postpone(1, this.economy.request, 1, this.field, this.position);

          } else if (this.units.match(asset)){
            this.economy.request(1, this.units, this.position);

          } else if (this.dropsite.match(asset)){
            // dropsite is shared, custodian orders new one
            this.position = this.units;

          }

        },


        // there are enemies and gaia
        onAttack: function(asset, enemy, type, damage){

          deb("     G: %s onAttack %s by %s, damage: %s", this, asset, enemy, damage);

          if (this.field.match(asset)){
            this.units.doing("!repair").repair(asset);

          } else if (this.units.match(asset)){
            if (asset.health < 80 && this.shelter.exists()) { 
              this.shelter.nearest(1).garrison(asset);
            }
          }

        },

        // de-garrison
        onRelease: function(asset){

          deb("     G: %s onRelease: %s", this, asset);

          if (this.field.isFoundation){
            asset.repair(this.field);

          } else if (this.field.isStructure){
            asset.gather(this.field);

          } else {
            deb("WARN  : onRelease: no job for %s ", asset);

          }

        },


        // group radio
        onBroadcast: function(source, msg){

          deb("     G: %s onBroadcast from: %s, msg: %s", this, source, msg);
          
          if (msg.type === "must-repair"){
            this.units.repair(msg.resource);

          } else if (msg.type === "help-repair" && this.distance(msg.resource) < 100){
            this.units.repair(msg.resource);

          }

        },

        // defined by this.interval
        onInterval: function(){

          if (this.units.count){

            deb("     G: %s onInterval,  states: %s", this, H.prettify(this.units.states()));

            if (this.field.isFoundation){
              this.units.doing("!repair").repair(this.field);

            } else if (this.field.health < 80){
              this.units.doing("!repair").repair(this.field);

            } else {
              this.units.doing("gather").gather(this.field);

            }

          }

        }


      } // end listener

    }

  });

return H; }(HANNIBAL));

