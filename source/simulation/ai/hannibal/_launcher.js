/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals Engine, API3, deb, debTable, print, logObject, logError, TESTERDATA, uneval, logPlayers, logStart */

/*--------------- L A U N C H E R   -------------------------------------------

  Launches the AI/Bot for 0 A.D.
  Home: https://github.com/noiv/Hannibal/blob/master/README.md

  tested with 0 A.D. Alpha 15 Osiris
  V: 0.1, agentx, CGN, Feb, 2014

  Credits:

    kmeans: 
    pythonic slicing:
    helper:

*/

// very first line, enjoy
var TIMESTART = Date.now();

print("---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### --- " + new Date() + "\n");
print("#! xdotool init\n");

Engine.IncludeModule("common-api");


var HANNIBAL = (function() {

  var H = {
    API: API3,
    LIB: {},
    extend: function (o){
      Array.prototype.slice.call(arguments, 1)
        .forEach(e => {Object.keys(e)
          .forEach(k => o[k] = e[k]
    );});},
    throw: function(){
      throw "\n" + H.format.apply(null, H.toArray(arguments)) + "\n" + new Error().stack;      
    },
    chat: function(msg){
      Engine.PostCommand(H.Bot.id, {"type": "chat", "message": msg});
    }
  };

  // constructor
  H.Launcher = function(settings) {

    API3.BaseAI.call(this, settings);

    H.Launch = this;

    H.extend(this, {
      settings:     settings,                           // from user dialog
      isTicking:    false,                              // toggles after first OnUpdate
      initialized:  false,                              // did that happen well?
      isFinished:   false,                              // there is still no winner
      timing:       {all: 0},                           // used to identify perf. sinks in OnUpdate
      context:      {
        turn:         0,                                  // increments on AI ticks, not bot ticks
        ticks:        0,
        id:           settings.player,                    // used within 0 A.D.
        config:       H.Config.get(settings.difficulty),  // Sandbox or nightmare or ....
        difficulty:   settings.difficulty,
      }
    });

    deb();
    deb("------: Launcher.constructor.out");

  };

  H.Launcher.prototype = new H.API.BaseAI();
  H.Launcher.prototype.Serialize = function(){

    return {

      time:       (new Date()).toString(),

      id:         this.settings.id,
      civ:        this.civ,
      turn:       this.turn,
      ticks:      this.ticks,
      difficulty: this.settings.difficulty,
      config:     this.config.serialize(),

      brain:      this.bot.brain.serialize(),
      events:     this.bot.events.serialize(),
      economy:    this.bot.economy.serialize(),
      map:        this.bot.map.serialize(),
      military:   this.bot.military.serialize(),
      resources:  this.bot.resources.serialize(),
      scout:      this.bot.scout.serialize(),
      store:      this.bot.store.serialize(),
      tree:       this.bot.tree.serialize(),
      villages:   this.bot.villages.events.serialize(),

    };

  };
  H.Launcher.prototype.Deserialize = function(data, sharedScript){
    H.extend(this.context, data);
  };
  H.Launcher.prototype.CustomInit = function(gameState, sharedScript) {

    var ss = sharedScript, gs = gameState;

    deb();deb();
    logStart(ss, gs, this.settings);
    logPlayers(ss.playersData);

    // Shortcuts

    this.ticks = this.context.ticks || 0;        // increases if bot steps

    H.extend(this.context, {

      connector:          "engine",

      id:                  this.context.id         || this.settings.id,
      civ:                 this.context.civ        || this.civ,
      turn:                this.context.turn       || this.turn,
      ticks:               this.context.ticks      || this.ticks,
      difficulty:          this.context.difficulty || this.settings.difficulty,
      config:              this.context.config     || this.config.serialize(),

      width:               sharedScript.passabilityMap.width, 
      height:              sharedScript.passabilityMap.height, 
      cellsize:            gameState.cellSize, 
      circular:            sharedScript.circularMap,

      // gamestate:           gameState,
      // sharedscript:        sharedScript,

      player:              sharedScript.playersData[this.id], // http://trac.wildfiregames.com/browser/ps/trunk/binaries/data/mods/public/simulation/components/GuiInterface.js
      players:             sharedScript.playersData,

      states:              H.Proxies.States(gameState.entities._entities),
      metadata:            H.Proxies.MetaData(sharedScript._entityMetadata[this.id]),
      entities:            H.Proxies.Entities(gameState.entities._entities),
      templates:           H.Proxies.Templates(this.settings.templates),
      technologies:        H.Proxies.Technologies(sharedScript._techTemplates), 
      techtemplates:       H.Proxies.TechTemplates(sharedScript._techTemplates), 

      objects:             H.LIB.Objects(), // not a constructor

      map:                 new H.LIB.Map(this.context),
      effector:            new H.LIB.Effector(this.context),    
      resources:           new H.LIB.Resources(this.context),
      villages:            new H.LIB.Villages(this.context),

      query:               function(hcq, debug){
        return new H.Store.Query(this.context.culture.store, hcq, debug);
      },

      planner:              new H.HTN.Planner(H.extend({          // setup default planner
        name:      "eco.planner",
        operators: H.HTN.Economy.operators,
        methods:   H.HTN.Economy.methods,
        verbose:   1
      }, this.context),

    });



    // build a context the bot works in

    H.Each(this.context, function (name, item) {
      (item.import     && item.import());
      (item.initialize && item.initialize());
    });

    H.Bot = new H.LIB.Bot(this.context);




    // deb(uneval(H.SharedScript.passabilityClasses));
    // pathfinderObstruction:1, foundationObstruction:2, 'building-land':4, 'building-shore':8, default:16, ship:32, unrestricted:64


    // determine own, game's
    // this.civ            = H.Players[this.id].civ; 
    // this.civs           = H.unique(H.attribs(H.Players).map(function(id){return H.Players[id].civ;})); // in game civi
    
    // launch the stats extension
    // H.Numerus.init();                       

    H.Phases.init();                         // acquire all phase names
    this.tree    = new H.TechTree(this.id);  // analyse templates of bot's civ
    this.culture = new H.Culture(this.tree); // culture knowledgebase as triple store
    this.culture.searchTemplates();          // extrcact classes, resources, etc from templates
    this.culture.loadNodes();                // turn templates to nodes
    this.culture.loadEdges();                // add edges
    this.culture.loadEntities();             // from game to triple store
    this.culture.loadTechnologies();         // from game to triple store
    this.culture.finalize();                 // clear up
    this.tree.finalize();                    // caches required techs, producers for entities
    H.Phases.finalize();                     // phases order



// H.Grids.init();                         // inits advanced map analysis
    // H.Grids.dump(map);                      // dumps all grids with map prefix in file name
    // H.Grids.pass.log();

    // H.Resources.init();                      // extracts resources from all entities
    // H.Resources.log();
    H.Scout.init();                          // inits scout extension for scout group
    H.Groups.init();                         // registers groups
    // H.Villages.init();                       // organize buildings by civic centres

    
    H.Planner = new H.HTN.Planner({          // setup default planner
      name:      "eco.planner",
      operators: H.HTN.Economy.operators,
      methods:   H.HTN.Economy.methods,
      verbose:   1
    });

    // backlinks planning domain to default planner
    H.HTN.Economy.initialize(H.Planner, this.tree);
    // H.HTN.Economy.report("startup test");
    // H.HTN.Economy.test({tech: ['phase.town']});
    // this.tree.export(); // filePattern = "/home/noiv/Desktop/0ad/tree-%s-json.export";

    H.Brain.init();
    H.Economy.init();

    // Now make an action plan to start with
    // this needs to go to tick 0, later, because of autotech
    H.Stats.init();


    // H.Brain.planPhase({
    //   parent:         this,
    //   config:         H.Config,
    //   simticks:      50, 
    //   tick:           0,
    //   civ:            H.Bot.civ,
    //   tree:           H.Bot.tree,
    //   source:         this.id,
    //   planner:        H.Planner,
    //   state:          H.HTN.Economy.getCurState(),
    //   curstate:       H.HTN.Economy.getCurState(),
    //   phase:         "phase." + H.Player.phase,  // run to this phase until next phase is researchable or (city) run out of actions
    //   curphase:      "phase.village", 
    //   centre:         H.Villages.Centre.id,
    //   nameCentre:     H.class2name("civilcentre"),
    //   nameTower:      H.class2name("defensetower"),
    //   nameHouse:      H.class2name("house"),
    //   popuHouse:      H.QRY(H.class2name("house")).first().costs.population * -1, // ignores civ
    //   ingames:       [],
    //   technologies:  [],
    //   launches:     {"phase.village": [], "phase.town": [], "phase.city": []},
    //   messages:     {"phase.village": [], "phase.town": [], "phase.city": []},
    //   resources:      H.Resources.availability("wood", "food", "metal", "stone", "treasure"),
    // });
    
    this.initialized = true;

    // H.Config.deb = 0;


    /*

    Below is for development

    */


    /* Export functions */

    if (false){
      // activate to log tech templates
      deb("-------- _techTemplates");
      deb("var techTemplates = {");
      H.attribs(ss._techTemplates).sort().forEach(function(tech){
        deb("'%s': %s,", tech, JSON.stringify(ss._techTemplates[tech]));
      });
      deb("};");
      deb("-------- _techTemplates");
      H.Config.deb = 0;
    }

    if (false){
      // activate to log templates
      // this.culture.store.export(Object.keys(H.Data.Civilisations).filter(c => H.Data.Civilisations[c].active)); 
      this.culture.store.export(["athen"]); 
      // this.culture.store.exportAsLog(["athen"]);
      // this.culture.store.export(["athen", "mace", "hele"]); // 10.000 lines
      // this.culture.store.export(["athen"]); 
      // print("#! terminate");
    }

    /*  End Export */


    /* list techs and their modifications */

    if (false){

      deb();deb();deb("      : Technologies ---------");
      var affects, modus, table = [];
      H.each(H.Technologies, function(key, tech){
        if (tech.modifications){
          tech.modifications.forEach(function(mod){
            modus = (
              mod.add      !== undefined ? "add"      :
              mod.multiply !== undefined ? "multiply" :
              mod.replace  !== undefined ? "replace"  :
                "wtf"
            );
            affects = tech.affects ? tech.affects.join(" ") : mod.affects ? mod.affects : "wtf";
            table.push([H.saniTemplateName(key), mod.value, modus, mod[modus], affects]);
          });
        }
      });
      debTable("TEX", table, 1);
      deb("      : end ---------");
      H.Config.deb = 0;

    }

    /* end techs and their modifications */

    /* run scripted actions named in H.Config.sequence */

    deb();
    deb();
    H.Tester.activate();
    deb();

    /* end scripter */



    // testing Triple Store
    ts = this.culture.store;
    ts.debug = 5;

    // H.QRY(H.class2name("civilcentre") + " RESEARCH").execute("metadata", 5, 10, "next phases");

    // H.QRY("PAIR DISTINCT").execute("metadata", 5, 10, "paired techs");
    // H.QRY("TECHINGAME").execute("metadata", 5, 20, "ingame techs with metadata");

    // H.QRY("gather.lumbering.ironaxes").execute("metadata", 5, 10, "check");

    // new H.HCQ(ts, "INGAME WITH metadata.opname = 'none'").execute("metadata", 5, 10, "all ingame entities");
    // new H.HCQ(ts, "INGAME WITH id = 44").execute("metadata", 5, 10, "entity with id");
    // new H.HCQ(ts, "INGAME").execute("position", 5, 10, "ingames with position");

    // new H.HCQ(ts, "INGAME SORT < id").execute("metadata", 5, 80, "ingames with metadata");

    // new H.HCQ(ts, "TECHINGAME").execute("metadata", 5, 20, "ingame techs with metadata");
    // new H.HCQ(ts, "stone ACCEPTEDBY INGAME").execute("metadata", 5, 20, "stone drop");

    // new H.HCQ(ts, "food.grain GATHEREDBY WITH costs.metal = 0, costs.stone = 0, costs.wood = 0 SORT < costs.food MEMBER DISTINCT HOLDBY INGAME").execute("json", 5, 10, "optional update test");

    // new H.HCQ(ts, "civilcentre CONTAIN").execute("node", 5, 10, "civilcentre via class");
    // new H.HCQ(ts, "food.grain PROVIDEDBY").execute("node", 5, 10, "civilcentre via class");
    // new H.HCQ(ts, "food.grain PROVIDEDBY").execute("node", 5, 10, "civilcentre via class");
    
    // new H.HCQ(ts, "structures.athen.civil.centre MEMBER").execute("node", 5, 10, "classes of civilcentre");

    // new H.HCQ(ts, "food.grain PROVIDEDBY").execute("costs", 5, 10, "entities providing food.grain");
    // new HCQ(ts, "HOLD CONTAIN").execute("node", 5, 10, "all garissonable entities");
    // new HCQ(ts, "infantry HOLDBY").execute("node", 5, 10, "entities holding infantry");
    // new HCQ(ts, "support, infantry HOLDBY").execute("node", 5, 10, "entities holding infantry, support");
    // new HCQ(ts, "healer, hero").execute("", 5, 10, "classes: healer, hero");
    // new HCQ(ts, "healer, hero CONTAIN").execute("costs", 5, 10, "entities from classes: healer, hero");
    // new HCQ(ts, "healer, hero CONTAIN SORT > costs.metal").execute("costs", 5, 10, "entities from classes: healer, hero");
    // new HCQ(ts, "infantry CONTAIN SORT > costs.metal").execute("costs", 5, 20, "entities from classes: healer, hero, sorted by metal");
    // new HCQ(ts, "support, infantery HOLDBY SORT > capacity").execute("capacity", 5, 10, "entities holding: healer, hero, sorted by metal");
    // new HCQ(ts, "food.grain GATHEREDBY WITH costs.metal = 0, costs.wood = 0").execute("costs", 5, 20, "entities holding: healer, hero, sorted by metal");
    // new HCQ(ts, "food.grain PROVIDEDBY WITH civ = athen").execute("costs", 5, 20, "entities holding: healer, hero, sorted by metal");
    // new HCQ(ts, "food.grain GATHEREDBY WITH costs.metal = 0, costs.wood = 0 MEMBER HOLDBY").execute("costs", 5, 20, "entities holding: healer, hero, sorted by metal");
    // new HCQ(ts, "units.athen.support.female.citizen.house REQUIRE", 2).execute("node", 5, 10, "testing for required tech");
    // new HCQ(ts, "DESCRIBEDBY").execute("node", 5, 10, "trainer for");
    // new HCQ(ts, "INGAME").execute("node", 5, 10, "trainer for");
    // new HCQ(ts, "units.athen.infantry.spearman.b TRAINEDBY").execute("node", 5, 10, "trainer for");
    // new HCQ(ts, "units.athen.infantry.spearman.b TRAINEDBY INGAME").execute("node", 5, 10, "in game trainer for");
    // new HCQ(ts, "units.athen.infantry.spearman.b TRAINEDBY DESCRIBEDBY").execute("node", 5, 10, "in game trainer for");
    // new HCQ(ts, "food.grain GATHEREDBY WITH costs.metal = 0, costs.stone = 0, costs.wood = 0 SORT < costs.food").execute("costs", 5, 10, "in game trainer for");

    this.culture.debug = 0;


    // H.Triggers.add(H.Groups.launch.bind(H.Groups, "g.grainpicker", cics[0].id), 2);
    // H.Triggers.add(H.Groups.launch.bind(H.Groups, "g.grainpicker", cics[0].id), 3);

    // playfield
    try {

      // deb("------: Techs");
      // H.each(H.TechTemplates, function(name, tech){
      //   if (tech.modifications){
      //     var aff = tech.affects ? uneval(tech.affects) : "";
      //     var req = tech.requirements ? uneval(tech.requirements) : "";
      //     var mod = tech.modifications ? uneval(tech.modifications) : "";
      //     deb("%s;%s;%s;%s;%s", name, tech.genericName||"", req, aff, mod);
      //   }
      // });
      // deb("------: Techs end");

      // H.range(2).forEach(function(){deb("**");});

      // keep that 
      // logObject(API3, "API3");
      // logObject(HANNIBAL, "HANNIBAL");
      // logObject(gameState, "gameState");
      // logObject(global, "global");
      // logObject(Map, "Map");
      // logObject(global.Engine, "Engine");
      // logObject(this.entities, "entities");


      // logObject(ss.resourceMaps['food'].map, "ss.resourceMaps['food'].map");
      // logObject(ss.resourceMaps['food'], "ss.resourceMaps['food']");

      // logObject(H.Bot.gameState.ai.territoryMap, "H.Bot.gameState.ai.territoryMap");

      // logObject(ss._techTemplates['phase_city'], "phase_city");
      // logObject(ss._techTemplates['phase_town_athen'], "phase_town_athen");
      // logObject(ss._techTemplates['pair_gather_01'], "pair_gather_01");
      // logObject(ss._techTemplates['heal_range'], "heal_range");
      // logObject(ss._techTemplates['heal_temple'], "heal_temple");

       // logObject(H.Templates["units/athen_support_female_citizen"], "units/athen_support_female_citizen");

      // logObject(ss._techTemplates, "ss._techTemplates");
      // logObject(sharedScript, "sharedScript");
      // logObject(sharedScript.gameState, "sharedScript.gameState");
      // logObject(sharedScript.events, "events");
      // logObject(sharedScript.playersData, "playersData");
      // logObject(sharedScript.playersData[this.id], "playersData(me)");
      // logObject(sharedScript.playersData[this.id], "Hannibal");
      // logObject(sharedScript.playersData[this.id].statistics, "Statistics");
      // logObject(EntityCollection, "EntityCollection"); // that's strange
      // logObject(new Entity(sharedScript, entity), "EntityTemplate");
      // logObject(sharedScript.passabilityClasses, "sharedScript.passabilityClasses");
      // logObject(sharedScript.passabilityMap, "sharedScript.passabilityMap");
      // logObject(sharedScript.territoryMap, "sharedScript.territoryMap");

      // H.range(2).forEach(function(){deb("**");});


    } catch(e){logError(e, "playfield");} 
    // end playfield

    deb();
    deb("---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---");

  };

  H.Launcher.prototype.OnUpdate = function(sharedScript) {

    // http://trac.wildfiregames.com/wiki/AIEngineAPI

    var 
      t0        = Date.now(),
      msgTiming = "", 
      secs      = (H.GameState.timeElapsed/1000).toFixed(1),
      map       = TESTERDATA ? TESTERDATA.map : "unkown";

    // update shortcuts
    H.SharedScript      = sharedScript;
    H.TechTemplates     = H.SharedScript._techTemplates;
    H.Player            = H.SharedScript.playersData[this.id];
    H.Players           = H.SharedScript.playersData;
    H.MetaData          = H.SharedScript._entityMetadata[this.id];

    if (!this.initialized){
      if (!this.noInitReported){
        deb("---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---");
        deb();deb();
        deb("ERROR : HANNIBAL IS NOT INITIALIZED !!!");
        H.chat("HANNIBAL IS NOT INITIALIZED, check configuration/readme.txt");
        deb();deb();
        deb("---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---");
      }
      this.noInitReported = true;
      return;      
    }

    if (!this.isTicking){
      deb("---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---  ### ---");
      deb();deb();
      deb("------: OnUpdate: startup: %s secs, map: '%s'", ((t0 - TIMESTART)/1000).toFixed(3), map);
      deb();
      this.isTicking = true;
    }

    if (this.isFinished){return;}

    if (H.Tester.OnUpdate){
      H.chat("OnUpdate");
      H.Tester.OnUpdate();
    } else {
      // H.chat("no OnUpdate");
    }
    
    // save events, even if not processing
    H.Events.collect(this.events);

    // logObject(this, "thisOnUpdate");


    // ------------- A C T I O N   S T A R T ----------------------------------

    // Run the update every n turns, offset depending on player ID to balance the load
    if ((this.turn + this.player) % 8 === 5) {

      deb("STATUS: @%s, %s, %s, elapsed: %s secs, techs: %s, food: %s, wood: %s, metal: %s, stone: %s", 
        this.ticks, this.player, this.civ, secs, 
        H.count(H.Players[this.id].researchedTechs), 
        H.Player.resourceCounts.food,
        H.Player.resourceCounts.wood,
        H.Player.resourceCounts.metal,
        H.Player.resourceCounts.stone
      );

      if (this.ticks === 0){

        // allow processing autoresearch first

        // subscribe to messages
        this.culture.activate();
        H.Brain.activate();
        H.Groups.activate();
        H.Villages.activate();
        H.Economy.activate();
        H.Military.activate();

        this.timing.all = 0;
        this.timing.tst = H.Tester.tick(   secs, this.ticks);
        this.timing.trg = H.Triggers.tick( secs, this.ticks);
        this.timing.evt = H.Events.tick(   secs, this.ticks);

      } else {

        this.timing.all = 0;
        this.timing.tst = H.Tester.tick(   secs, this.ticks);
        this.timing.trg = H.Triggers.tick( secs, this.ticks);
        this.timing.evt = H.Events.tick(   secs, this.ticks);
        this.timing.brn = H.Brain.tick(    secs, this.ticks);
        this.timing.geo = H.Grids.tick(    secs, this.ticks);
        this.timing.gps = H.Groups.tick(   secs, this.ticks);
        this.timing.mil = H.Military.tick( secs, this.ticks);
        this.timing.sts = H.Stats.tick(    secs, this.ticks);
        this.timing.eco = H.Economy.tick(  secs, this.ticks);

      }

      // deb: collect stats
      if (H.Config.numerus.enabled){
        H.Numerus.tick(secs, this.ticks);
      }

      // deb: prepare line
      H.each(this.timing, (name, msecs) => {
        if (name !== "all"){
          msgTiming += H.format(", %s: %s", name, msecs);
        }
        this.timing.all += msecs;
      });

      deb("______: @%s, trigs: %s, timing: %s, all: %s %s", 
        this.ticks, 
        H.Triggers.info(), 
        msgTiming, 
        this.timing.all, 
        this.timing.all >= 100 ? "!!!!!!!!" : ""
      );

      // // check for winner
      // if (this.frame.name === "whiteflag") {
      //   this.isFinished = true;
      //   H.chat("Nothing to control. So I'll just assume I lost the game. :(");
      //   H.chat("We'll meet again, boy!");
      //   return;
      // }
        
      // if (this.frame.name === "victory") {
      //   this.isFinished = true;
      //   H.chat("I do not have any target. So I'll just assume I won the game.");
      //   H.chat("You lost!");
      //   return;
      // }


      // deb("      : ECs: %s, %s", 
      //   H.SharedScript._entityCollections.length, H.attribs(H.SharedScript._entityCollectionsName)
      // );

      this.ticks++;


      // ------------- A C T I O N   E N D --------------------------------------

      deb("  ");
      
    }

    this.turn++;

  };


return H;}());