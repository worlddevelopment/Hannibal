/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, uneval, Engine */

/*--------------- H A N N I B A L ---------------------------------------------

  this is the actual bot, it loads from start, saved game or context and 
  runs against the engine or in a simulation


  tested with 0 A.D. Alpha 17 Quercus
  V: 0.1, agentx, CGN, NOV, 2014

*/

HANNIBAL = (function(H){

  H.LIB.Bot = function(context){

    H.extend(this, {

      context: context,

      klass:    "bot",
      parent:   context,
      name:     H.format("%s:%s#%s", context.name, "bot", context.id),

      imports: [
        "id",
        "player",
        "entities",
        "templates",
        "events",
        "map",
        "brain",
        "groups",
        "economy", 
        "culture",
        "effector",
        "military",
        "villages",
        "resources",
      ],

    });

  };

  H.LIB.Bot.prototype = H.mixin (
    H.LIB.Serializer.prototype, {
    constructor: H.LIB.Bot,
    log: function(){
      deb(); deb("   BOT: loaded: %s", this);
    },
    deserialize: function(data){
      return this;
    },
    serialize: function(){
      var data = {};
      return data;
    },
    initialize: function(){
      return this;
    },
    activate: function(){},
    tick: function(secs, tick, timing){

      if (tick === 0){

        // allow processing autoresearch first
        timing.brn = this.brain.tick(         secs, tick);
        timing.map = this.map.tick(           secs, tick);
        timing.gps = this.groups.tick(        secs, tick);
        timing.mil = this.military.tick(      secs, tick);
        timing.sts = this.economy.stats.tick( secs, tick);
        timing.eco = this.economy.tick(       secs, tick);

      } else {

        [

          ["evt", "Events",          this.events       ],
          ["brn", "Brain",           this.brain        ], 
          ["map", "Map",             this.map          ], 
          ["gps", "Groups",          this.groups       ], 
          ["mil", "Military",        this.military     ], 
          ["sts", "Economy.Stats",   this.economy.stats], 
          ["eco", "Economy",         this.economy      ]

        ].forEach(task => {

          Engine.ProfileStart("Hannibal " + task[1]);
          timing[task[0]] = task[2].tick.apply(task[2], [secs, tick]);
          Engine.ProfileStop();

        });

      }

    },
    unitprioritizer: function(){

      var 
        phase = this.culture.phases.current,
        availability = this.economy.availability;

      function villSorter (nodes){
        nodes
          .sort((a, b) => a.costs[availability[0]] < b.costs[availability[0]] ? 1 : -1 )
          .sort((a, b) => a.costs[availability[1]] < b.costs[availability[1]] ? 1 : -1 )
          .sort((a, b) => a.costs[availability[2]] < b.costs[availability[2]] ? 1 : -1 )
          .sort((a, b) => a.costs[availability[3]] < b.costs[availability[3]] ? 1 : -1 );
      }        

      if (phase === "vill"){
        return villSorter;

      } else if (phase === "town") {
        return villSorter;
        // return function(){this.deb("WARN  : bot.unitsortorder for town not implemented");};

      } else if (phase === "city") {
        return villSorter;
        // return function(){this.deb("WARN  : bot.unitsortorder for city not implemented");};

      } else {
        return function(){this.deb("ERROR : bot.unitsortorder for '%s' not implemented", phase);};

      }


    }

  });

return H; }(HANNIBAL));  

