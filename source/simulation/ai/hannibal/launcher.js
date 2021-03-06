/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, HANNIBAL_DEBUG, Engine, API3, uneval */

/*--------------- L A U N C H E R   -------------------------------------------

  Launches an AI/Bot in a fresh or saved context.
  Home: https://github.com/noiv/Hannibal/blob/master/README.md

  tested with 0 A.D. Alpha 18 Rhododactylus
  V: 0.1.1, agentx, CGN, Mar, 2015

*/


HANNIBAL = (function(H) {

  // API bot constructor
  H.Launcher = function(settings) {

    var id = settings.player;

    API3.BaseAI.call(this, settings);

    H.extend(this, {

      id:             id,
      name:           "H" + id,
      klass:          "launcher",
      debug:          HANNIBAL_DEBUG ? HANNIBAL_DEBUG.bots[id] : {},
      map:            HANNIBAL_DEBUG ? HANNIBAL_DEBUG.map : "unknown",
      deb:            H.deb.bind(null, id),
      chat:           H.chat.bind(null, id),

      settings:         settings,                    // from ai config dialog
      isInitialized:    false,                       // did that happen well?
      isTicking:        false,                       // toggles after first OnUpdate
      isFinished:       false,                       // there is still no winner
      cantplay:         false,                       // map/game misses something important
      cantplayReported: false,                       // debug, report init failure only once
      noInitReported:   false,                       // debug, report init failure only once
      timing:           {all: 0},                    // used to identify perf. sinks in OnUpdate
      
    });

    // create empty context
    this.context = new H.LIB.Context("C1", this);

    this.deb("      : Launcher.out: ID: %s, debug: %s", this.id, uneval(this.debug));

  };

  H.Launcher.prototype = new H.API.BaseAI();
  H.Launcher.prototype.Deserialize = function(data /*, sharedScript */ ){
    this.context.deserialize(data);
  };
  H.Launcher.prototype.Serialize = function(){
    return this.context.serialize();
  };
  H.Launcher.prototype.CustomInit = function(gameState, sharedScript) {

    var 
      t0  = Date.now(),
      ss  = sharedScript, 
      gs  = gameState,
      civ = ss.playersData[this.id].civ;

    H.deb("------: HANNIBAL.Launcher.CustomInit %s/%s in", this.id, civ);

    // debug, suppress (not init) this bot
    if (this.debug.sup){
      H.deb("------: HANNIBAL.Launcher.CustomInit %s/%s supressed", this.id, civ);
      return;
    }

    // debug, move window
    if (this.debug.xdo){
      this.deb("#! xdotool init");
    }

    // debug, launch the stats extension
    if (this.debug.numerus){
      H.Numerus.init(this.id, ss, gs);          
    }             

    // debug, game info
    this.logStart(ss, gs, this.settings);
    this.logPlayers(ss.playersData);
    this.deb();

    // link the context with game engine, and initialize
    this.context.connectEngine(this, gameState, sharedScript, this.settings);
    this.context.initialize(H.Config);

    // This bot faces the other players
    this.bot = this.context.createBot();
    this.cantplay = !this.bot.canplay;
    


  /* below is for development

    */

    var lines1, lines2, lines3, diff;

    // H.logObject(sharedScript.passabilityClasses, "sharedScript.passabilityClasses");

    // H.logObject(Engine, "Engine");

    // H.logObject(global, "global");
    // H.logObject(API3, "API3");
    // H.logObject(gameState, "gameState");
    // H.logObject(gameState, "sharedScript");
    // H.logObject(Map, "Map");

    // this.context.log();

    // lines1 = exportJSON(this.context.serialize(), "ctx1.serialized");

    // deb();
    // deb("################################################################################");
    // deb();

    // clone second context to compare serialization
    // this.secondContext = this.context.clone();
    // this.secondBot     = this.secondContext.createBot();
    // lines2 = exportJSON(this.secondContext.serialize(), "ctx2.serialized");
    
    // deb();
    // deb("################################################################################");
    // deb();

    // third context via de/serialize
    // this.thirdContext = new H.LIB.Context("ctx3");
    // this.thirdContext.deserialize(this.context.serialize());
    // this.thirdContext.connectEngine(this, gameState, sharedScript, this.settings);
    // this.thirdContext.initialize(H.Config);

    // diff = diffJSON(this.context.serialize(), this.thirdContext.serialize());
    // logJSON(diff, "ctx1 vs. ctx3");

    // this.thirdContext.log();
    // this.thirdBot     = this.thirdContext.createBot();
    // lines3 = exportJSON(this.thirdContext.serialize(), "ctx3.serialized");

    // deb();
    // deb("SRLIAZ: ctx 1: %s lines", lines1);
    // deb("SRLIAZ: ctx 2: %s lines", lines2);
    // deb("SRLIAZ: ctx 3: %s lines", lines3);
    // deb();
    // deb("################################################################################");

    /* testing triple store */
    this.context.culture.debug = 5;

    this.context
      .query("structure CONTAIN INGAME")
    //   // .query("structures.athen.wall.tower")
    //   // .query("structures.athen.wallset.stone MEMBER")
    //   // .parameter({format: "metadata", deb: 5, debmax: 10, comment: "next phases"})
      .parameter({fmt: "meta", deb: 5, max: 10, cmt: "launcher.CustomInit"})
      .execute()
    ;
    
    // this.context
    //   .query("structures.athen.wallset.stone BUILDBY")
    //   // .query("structures.athen.wall.tower")
    //   // .query("structures.athen.wallset.stone MEMBER")
    //   // .parameter({format: "metadata", deb: 5, debmax: 10, comment: "next phases"})
    //   .parameter({fmt: "meta", deb: 5, max: 10, cmt: "launcher.CustomInit"})
    //   .execute()
    // ;
    
    this.context.culture.debug = 0;
    /* end testing triple store */


    // H.Config.deb = 0; // suppress further log lines

  /* end of development

    */

    this.initialized = true;

    this.deb("      :");
    this.deb("      :");
    H.deb("------: HANNIBAL.Launcher.CustomInit %s/%s out %s msecs, ", this.id, civ, Date.now() - t0);

    return;

  };
  H.Launcher.prototype.OnUpdate = function(sharedScript) {

    var 
      deb = this.deb.bind(this),
      ss = sharedScript,
      t0 = Date.now(),
      secs = (ss.timeElapsed/1000).toFixed(1),
      msgTiming = "";

    // 
    if (this.debug.sup){return;}
    if (this.isFinished){return;} // API ????

    if (!this.initialized){
      if (!this.noInitReported){
        this.logNotInitialized();
      }
      this.noInitReported = true;
      return;      
    }

    if (this.cantplay){
      if (!this.cantplayReported){
        this.logCantPlay();
      }
      this.cantplayReported = true;
      return;      
    }

    if (!this.isTicking){
      this.logFirstTick(t0, ss.playersData[this.id].civ);
      this.isTicking = true;
    }

    // keep API events from each turn, even if not processing
    this.context.events.collect(this.events);


    // ------------- A C T I O N   S T A R T ----------------------------------

    // Run the update every n turns, offset depending on player ID to balance the load
    if ((this.turn + this.player) % 8 === 5) {

      Engine.ProfileStart("Hannibal Tick.in");

      // Engine.DumpImage("passabilityMap" + this.turn + ".png", 
      //   H.lowerbyte(sharedScript.passabilityMap.data), 
      //   sharedScript.passabilityMap.width, 
      //   sharedScript.passabilityMap.height, 
      //   255
      // );    

      // update context
      this.context.updateEngine(sharedScript, secs);

      // (new H.LIB.Grid(this.context))
      //   .import()
      //   .initialize({label: "pass", data: H.lowerbyte(sharedScript.passabilityMap.data)})
      //   .process((i, x, z, v) => (v & 2) ? 255 : 0)
      //   .dump("sync" + this.context.tick, 255)
      //   .release()
      // ;

      // log top row debug info
      deb("------: %s@%s, elapsed: %s secs, %s/%s, techs: %s, food: %s, wood: %s, metal: %s, stone: %s", 
        this.id,
        this.context.tick, secs, 
        this.bot.player.civ, this.context.culture.phases.current,
        H.count(this.bot.player.researchedTechs), 
        this.bot.player.resourceCounts.food,
        this.bot.player.resourceCounts.wood,
        this.bot.player.resourceCounts.metal,
        this.bot.player.resourceCounts.stone
      );

      // reset timing info
      this.timing.all = 0;
      // this.timing.tst = 0;

      // debug, init tester
      if (this.context.tick === 0 && this.debug.tst){
        this.context.scripter.prepare(this.map);
        // H.Tester.activate(this.map, this.context); 
        // H.Tester.log(); 
      }

      // debug, execute test scripts 
      if (this.debug.tst){
        this.timing.tst = this.context.scripter.tick(secs, this.context.tick);
      }

      // THIS IS THE MAIN ACT
      Engine.ProfileStop();
      this.bot.tick(secs, this.context.tick, this.timing);
      Engine.ProfileStart("Hannibal Tick.out");

      // debug, collect stats
      if (this.debug.numerus){
        H.Numerus.tick(secs, this.context.tick, sharedScript);
      }

      // debug, prepare bottom row info
      H.each(this.timing, (name, msecs) => {
        if (name !== "all" && msecs > 0){
          msgTiming += H.format(", %s: %s", name, msecs);
        }
        this.timing.all += msecs;
      });


      // log/warn row
      if (this.timing.all >= 100){
        deb("WARN  : %s@%s timing: %s, all: %s", 
          this.id,
          this.context.tick, 
          msgTiming, 
          this.timing.all
        );

      } else {
        deb("------: %s@%s timing: %s, all: %s", 
          this.id,
          this.context.tick, 
          msgTiming, 
          this.timing.all
        );
      }

      // increase tick number
      this.context.tick++;

      Engine.ProfileStop();

      // ------------- A C T I O N   E N D --------------------------------------

      deb("      :");
      
    }

    // increase turn number
    this.context.turn++;
    this.turn++;

  };
  H.Launcher.prototype.logCantPlay = function() {
    var deb = this.deb.bind(this);
    deb("------: ### --- ### --- ### --- PID: %s, HANNIBAL: ", this.id, new Date());
    deb();
    deb("ERROR : HANNIBAL CAN'T PLAY THIS MAP/GAME !!!");
    this.chat("HANNIBAL CAN'T PLAY THIS MAP/GAME, check install.txt");
    deb();
    deb("------: ### --- ### --- ### --- PID: %s, HANNIBAL: ", this.id, new Date());
  };
  H.Launcher.prototype.logNotInitialized = function() {
    var deb = this.deb.bind(this);
    deb("------: ### --- ### --- ### --- PID: %s, HANNIBAL: ", this.id, new Date());
    deb();
    deb("ERROR : HANNIBAL IS NOT INITIALIZED !!!");
    this.chat("HANNIBAL IS NOT INITIALIZED, check install.txt");
    deb();
    deb("------: ### --- ### --- ### --- PID: %s, HANNIBAL: ", this.id, new Date());
  };
  H.Launcher.prototype.logFirstTick = function(t0, civ) {
    var deb = this.deb.bind(this);
    deb("------: HANNIBAL.firstTick: %s/%s, %s, after: %s secs", this.id, civ, this.map, ((t0 - H.MODULESTART)/1000).toFixed(1));
    deb();
  };
  H.Launcher.prototype.logStart = function(ss, gs, settings){

    var deb = this.deb.bind(this), id = this.id;

    deb("------: LAUNCHER.CustomInit: PID: %s, Players: %s, difficulty: %s", id, H.count(ss.playersData), settings.difficulty);
    deb("      :");
    deb("     A:     map from DEBUG: %s", this.map);
    deb("     A:                map: %s, circ: %s, size: %s", ss.gameType, ss.circularMap, ss.mapSize);
    deb("     A:        passability: w: %s, len: %s, cellsize: %s", ss.passabilityMap.width, ss.passabilityMap.data.length, ss.passabilityMap.cellSize);
    deb("     A:          territory: w: %s, len: %s, cellsize: %s", ss.territoryMap.width, ss.territoryMap.data.length, ss.territoryMap.cellSize);
    deb("     A:          _entities: %s [  ]", H.count(ss._entities));
    deb("     A:         _templates: %s [  ]", H.count(ss._templates));
    deb("     A:     _techTemplates: %s [  ]", H.count(ss._techTemplates));
    deb("     H: _techModifications: %s [XX]", H.count(ss._techModifications[id]));
    deb("     H:     researchQueued: %s [  ]", H.count(ss.playersData[id].researchQueued));
    deb("     H:    researchStarted: %s [  ]", H.count(ss.playersData[id].researchStarted));
    deb("     H:    researchedTechs: %s [%s]", H.count(ss.playersData[id].researchedTechs), H.attribs(ss.playersData[id].researchedTechs).join(", "));
    deb("     A:       barterPrices: %s", H.prettify(ss.barterPrices));

  };
  H.Launcher.prototype.colorFromRGBA = function(color){

    var 
      colorname,
      c = {r: color.r.toFixed(2), g: color.g.toFixed(2), b: color.b.toFixed(2), a: color.a.toFixed(2)};

    colorname = (
      (c.r === "1.00" && c.g === "1.00" && c.b === "1.00") ? "white" : 
      (c.r === "0.18" && c.g === "0.18" && c.b === "0.78") ? "blue" : 
      (c.r === "0.59" && c.g === "0.08" && c.b === "0.08") ? "red" : 
      (c.r === "0.20" && c.g === "0.65" && c.b === "0.02") ? "green" : 
      (c.r === "0.90" && c.g === "0.90" && c.b === "0.29") ? "yellow" : 
      (c.r === "0.20" && c.g === "0.67" && c.b === "0.67") ? "turquois" : 
      (c.r === "0.63" && c.g === "0.31" && c.b === "0.78") ? "violet" : 
      (c.r === "0.92" && c.g === "0.47" && c.b === "0.08") ? "orange" : 
      (c.r === "0.25" && c.g === "0.25" && c.b === "0.25") ? "black" : 
        "unknown"
    );

    return [c, colorname];

  },
  H.Launcher.prototype.logPlayers = function(players){

    var 
      deb = this.deb.bind(this), len = players.length,
      tab = H.tab, msg = "", head, props, format, tabs,
      fmtAEN = item => item.map(b => b ? "1" : "0").join("");

    this.deb();

    head   = "name, team, civ, phase,      pop,   ally,   enemy,      neut,      color".split(", ");
    props  = "name, team, civ, phase, popCount, isAlly, isEnemy, isNeutral".split(", ");
    tabs   = [  10,    6,   8,    10,        5,      3,       4,         3,         12];
    format = {
      isAlly:    fmtAEN,
      isEnemy:   fmtAEN,
      isNeutral: fmtAEN,
      colour:    (c) => this.colorFromRGBA(c)[1],
    };

    H.zip(head, tabs, (h, t) => {
      if (h.trim()==="ally" || h.trim()==="enemy" || h.trim()==="neut"){
        t += len;
      }
      msg += tab(h, t);
    });
    deb("PLAYER: " + msg);

    // H.logObject(players, "logPlayers: players");

    H.each(players, (id, player) => {
      msg = "";
      H.zip(props, tabs, (p, t) => {
        if (p==="isAlly" || p==="isEnemy" || p==="isNeutral"){
          t += len;
        }
        msg += (format[p]) ? tab(format[p](player[p]), t) : tab(player[p], t);
      });    
      deb("     %s: %s", id, msg);
    });

  };
  H.Launcher.prototype.diffJSON = function (a, b) {

    // https://github.com/paldepind/dffptch
    
    var 
      O = Object, keys = O.keys,
      aKey, bKey, aVal, bVal, rDelta, shortAKey, 
      aKeys = keys(a).sort(),
      bKeys = keys(b).sort(),
      delta = {}, adds = {}, mods = {}, dels = [], recurses = {},
      aI = 0, bI = 0;

    // Continue looping as long as we haven't reached the end of both keys lists

    while(aKeys[aI] !== undefined || bKeys[bI]  !== undefined || false) {
      
      aKey = aKeys[aI]; 
      bKey = bKeys[bI];
      aVal = a[aKey];
      bVal = b[bKey];
      shortAKey = String.fromCharCode(aI+48);

      if (aKey == bKey) {

        // We are looking at two equal keys this is a
        // change – possibly to an object or array
        
        if (O(aVal) === aVal && O(bVal) === bVal) {
        
          // Find changs in the object recursively
          rDelta = H.diffJSON(aVal, bVal);
        
          // Add recursive delta if it contains modifications
          if (keys(rDelta)) {recurses[shortAKey] = rDelta;}
        
        } else if (aVal !== bVal) {
          mods[shortAKey] = bVal;
        
        }
        
        aI++; bI++;

      } else if (aKey > bKey || !aKey) {
        // aKey is ahead, this means keys have been added to b
        adds[bKey] = bVal;
        bI++;

      } else {
        // bKey is larger, keys have been deleted
        dels.push(shortAKey);
        aI++;

      }
    }

    // We only add the change types to delta if they contains changes
    if (dels[0]) delta.d = dels;
    if (keys(adds)[0]) delta.a = adds;
    if (keys(mods)[0]) delta.m = mods;
    // if (keys(recurses)[0]) delta.r = recurses;
    
    return delta;

  };

return H; }(HANNIBAL));
