/*jslint bitwise: true, browser: true, todo: true, evil:true, devel: true, debug: true, nomen: true, plusplus: true, sloppy: true, vars: true, white: true, indent: 2 */
/*globals HANNIBAL, deb, uneval */

/*--------------- E C O N O M Y -----------------------------------------------

  Priotizes requests for resources. Trains, researches and construct them.


  tested with 0 A.D. Alpha 15 Osiris
  V: 0.1, agentx, CGN, Feb, 2014

*/


HANNIBAL = (function(H){

  // relies on c before e
  var config = H.Config.economy,
      ress        = {food: 0, wood: 0, stone: 0, metal: 0, pops: 0, health: 0, area: 0},
      allocations = {food: 0, wood: 0, stone: 0, metal: 0, population: 0};

  function pritc(cost){ // pretty cost
    var out = [];
    Object.keys(cost).forEach(r => {
      if(cost[r]){out.push(r + ":" + cost[r]);}
    });
    return out.join(",");
  }

  H.Stats = {

    stock: H.deepcopy(ress), // currently available via API
    alloc: H.deepcopy(ress), // allocated per queue
    forec: H.deepcopy(ress), // ???
    trend: H.deepcopy(ress), // as per stack
    stack: H.map(ress, H.createRingBuffer.bind(null, config.lengthStatsBuffer)), // last x stock vals
    tick: function(){

      var t0 = Date.now(), curHits = 1, maxHits = 1, 
          stock   = H.Stats.stock, 
          stack   = H.Stats.stack, 
          trend   = H.Stats.trend;
          
      // ctx.lstUnits.forEach(function(unit){
      //   curHits += unit.hitpoints();
      //   maxHits += unit.maxHitpoints();
      // });    

      stock.food   = H.PlayerData.resourceCounts.food;
      stock.wood   = H.PlayerData.resourceCounts.wood;
      stock.stone  = H.PlayerData.resourceCounts.stone;
      stock.metal  = H.PlayerData.resourceCounts.metal;
      stock.pops   = H.PlayerData.popCount;
      stock.area   = H.Player.statistics.percentMapExplored;
      stock.health = ~~((curHits / maxHits) * 100); // integer percent only    

      // buffers
      H.attribs(ress).forEach(function(prop){ 
        stack[prop].push(stock[prop]);      // buffers
        trend[prop] = stack[prop].trend();  // trend
      });

      return Date.now() - t0;

    }

  }; 

  H.Producers = (function(){

    var self, name, producers = [], tree, maxQueue = 3;

    function isProducer(name){
      if (tree[name] && tree[name].products.count){
        return true;
      } else {
        deb("   PDC: not a producer: %s", name);
        return false;
      }
    }

    return {
      boot: function(){self = this; return self;},
      init: function(oTree){

        deb();deb();deb("   PDC: init");

        tree = oTree.nodes;

        H.QRY("INGAME").forEach(node => {
          name = node.name.split("#")[0];
          if (isProducer(name)){
            node.queue = [];
            producers.push(node);
          }
        });

        producers.forEach(p => {
          deb("     P: %s", p.name);
          ["train", "build", "research"].forEach(verb => {
            deb("     P:    %s", verb);
            H.attribs(tree[p.name.split("#")[0]].products[verb]).forEach(prod => {
              deb("     P:     %s", prod);
            });
          });
        });

        deb("   PDC: found %s producers", producers.length);

      },
      find: function(product, ccid){

        var producer = null, verb = tree[product].verb, i = producers.length;

        // has no producer
        if(!verb){return null;}

        switch (verb){

          case "build":
            // can ignore cc and queue
            while ((producer = producers[--i])){
              name = producer.name.split("#")[0];
              if (tree[name].products.build[product]){
                break;  
              }        
            }
          break;

          case "research":
          // can ignore cc
            while ((producer = producers[--i])){
              name = producer.name.split("#")[0];
              if (tree[name].products.research[product]){
                if (producer.queue.length <= maxQueue){
                  break;
                }
              }        
            }
          break;
          
          case "train":
            while ((producer = producers[--i])){
              name = producer.name.split("#")[0];
              if (tree[name].products.train[product]){
                if (ccid && H.MetaData[producer.id].ccid === ccid){
                  if (producer.queue.length <= maxQueue){
                    break;
                  }
                }
              }        
            }
          break;
          
          default:
            deb("ERROR : Producer.find unknown verb %s for %s", verb, product);
        }

        if (producer){
          deb("   PDC: found %s for %s with cc: %s, verb: %s", producer.name, product, ccid, verb);
        } else {
          deb("   PDC: found NONE for %s with cc: %s, verb: %s", product, ccid, verb);
        }

        return producer;
      },
      loadById: function(id){
        var node = H.QRY("INGAME WITH id = " + id).first();
        if(node){
          node.queue = [];
          producers.push(node);
          deb("   PDC: new %s", node.name);
        } else{
          deb("ERROR: PDC failed new id: %s", id);
        }
      },
      removeById: function(id){
        var p, i = producers.length;
        while ((p = producers[--i])){
          if (p.id === id){
            producers.splice(i, 1);
            deb("   PDC: removed %s", p.name);
            break;
          }
        }
        deb("ERROR : PDC can't remove id: %s", id);
      },

    };

  }().boot());

  // local process wrapper around an order
  H.Order = function(order){

    this.order = order;
    this.remaining = order.amount;
    this.executed  = 0;             // send to engine

    //TODO: make units move to order.position

  };

  H.Order.prototype = {
    constructor: H.Order,
    evaluate: function(allocs){

      var self = this, order = this.order;

      this.execute = false; // ready to send

      this.nodes = H.QRY(order.hcq).forEach(function(node){
        // think positive
        node.qualifies = true;
      });
    
      // assigns ingames if available and matching
      this.assignExisting();      
      if (this.remaining === 0){
        return;
      } 

      this.checkProducers();      // can we produce nodes now?
      this.checkRequirements();   // any other obstacles?

      // remove disqualified nodes
      this.nodes
        .filter(function(node){return !node.qualifies;})
        .forEach(function(node){
          self.nodes.splice(self.nodes.indexOf(node), 1);
      });

      if (this.nodes.length){

        // mark
        this.execute = true;

        // simple sort for cheapest 
        this.nodes = this.nodes
          .sort(function(an, bn){return an.costs.metal - bn.costs.metal;})
          .sort(function(an, bn){return an.costs.stone - bn.costs.stone;})
          .sort(function(an, bn){return an.costs.wood  - bn.costs.wood;})
          .sort(function(an, bn){return an.costs.food  - bn.costs.food;});

        // write costs for remaining into allocs
        allocs.food  += this.nodes[0].costs.food  * this.remaining;
        allocs.wood  += this.nodes[0].costs.wood  * this.remaining;
        allocs.stone += this.nodes[0].costs.stone * this.remaining;
        allocs.metal += this.nodes[0].costs.metal * this.remaining;

        // deb("    OE: #%s have %s nodes, execute: %s, cost of first: ", order.id, this.nodes.length, this.execute, H.prettify(this.nodes[0].costs));

      } else {
        deb("    OE: #%s no nodes left", order.id);

      }

    },
    assignExisting: function(){

      var hcq, nodes;

      // looking for unit not assigned to a group
      if (this.order.verb === "train"){
        hcq = this.order.hcq + " INGAME WITH metadata.opname = 'none'";

      // looking for a shared structure
      } else if (this.order.verb === "build" && this.order.shared) {
        hcq = this.order.hcq + " INGAME WITH metadata.opmode = 'shared'";

      // looking for abandoned structure not assigned to a group
      } else if (this.order.verb === "build" && !this.order.shared) {
        hcq = this.order.hcq + " INGAME WITH metadata.opname = 'none'";

      } else {
        deb("Error: assignExisting run into unhandled case: %s, shared: %s", this.order.verb, this.order.shared);
        return;

      }

      nodes = H.QRY(hcq).execute(); // "metadata", 5, 10, "assignExisting");

      // if (!nodes.length) {
      //   // deb("    OC: #%s found none existing for %s", this.order.id, hcq);
      // }

      nodes.slice(0, this.remaining).forEach(function(node){
        deb("    OC: #%s found existing: %s FOR %s", this.order.id, node.name, hcq);
        this.executed += 1; 
        H.Economy.listener("onOrderReady", node.id, {metadata: {order: this.order.id}});
      }, this);

    },
    checkProducers: function(){

      // picks an in game producer for each node, currently the first found
      // trainingQueueTime === trainingQueueLength for train, research O_O

      var self = this;

      this.nodes.forEach(function(node){
        node.producer  = H.Producers.find(node.name, self.order.ccid);
        node.qualifies = !node.producer ? false : node.qualifies;
      });

      // var hcq, prods, verb = {
      //       "train":      "TRAINEDBY",
      //       "build":      "BUILDBY",
      //       "research":   "RESEARCHEDBY",
      //       "claim":      "???"
      //     }[this.order.verb];

      // this.nodes.forEach(function(node){
      //   hcq   = H.format("%s %s INGAME", node.name, verb);
      //   prods = H.QRY(hcq).execute();
      //   if (prods.length) {
      //     node.producer = prods[0].id;
      //     // deb("    OC: #%s found ingame producer: %s (#%s) FOR %s WITH ACTION: %s", self.order.id, prods[0].name, prods[0].id, node.name, self.order.verb);
      //   } else {
      //     node.qualifies = false;
      //   }
      // }, this);  

    },
    checkRequirements: function(){

      var self = this, good = 0, bad = 0, tree = H.Bot.tree.nodes, req;

      // testing each node for tech requirements
      this.nodes.forEach(function(node){
        req = tree[node.name].requires;
        node.qualifies = req ? H.Technologies.available([req]) : true;
        good += node.qualifies ? 1 : 0;
        bad  += node.qualifies ? 0 : 1;
      });    

      if (good + bad){
        deb("    OC: #%s requirements %s/%s FOR %s", self.order.id, good, bad, this.order.hcq);
      }

    }

  };

  H.OrderQueue = (function(){
    var self, t0, tP, queue = [], log = {rem: [], exe: [], ign: []};
    return {
      get length () {return queue.length;},
      boot:    function(){self = this; return self;},
      append:  function(item){queue.push(item); return self;},
      prepend: function(item){queue.unshift(item); return self;},
      remove:  function(item){H.remove(queue, item);},
      forEach: queue.forEach.bind(queue),
      filter:  queue.filter.bind(queue),
      search:  function(fn){
        var i, len = queue.length;
        for (i=0;i<len;i++){
          if (fn(queue[i])){
            return queue[i];
          }
        }
        return undefined;
      },
      log: function(t0){

        // isGo    = H.OrderQueue.filter(function(r){return r.go;}).length,
        // isEval  = H.OrderQueue.filter(function(r){return r.evaluated;}).length;

        deb("   ECO: queue: %s, %s msecs, rem: %s, ign: %s, exe: %s", queue.length, tP, log.rem, log.ign, log.exe);

      },      
      process: function(){

        var 
          amount, node, id,
          allocs     = H.deepcopy(allocations),
          budget     = H.deepcopy(H.Stats.stock),
          allGood    = false, 
          builds     = 0; // only one construction per tick
          
        t0 = Date.now();
        log.rem.length = 0; log.ign.length = 0; log.exe.length = 0;

        if (!queue.length){return;}

        queue
          .forEach(function(order){order.evaluate(allocs);});

        allGood = H.Economy.fits(allocs, budget);
        deb("    OQ: allGood: %s, allocs: %s, queue: %s", allGood, uneval(allocs), queue.length);

        queue
          .filter(function(order){return order.execute && order.executed < order.order.amount;})
          .forEach(function(order){

            id = order.order.id;
            node = order.nodes[0];
            amount = allGood ? order.order.amount - order.executed : 1;

            if (allGood || self.fits(node.costs, budget)){

              switch(order.order.verb){

                case "train":
                  // deb("    PQ: #%s train, prod: %s, amount: %s, tpl: %s", id, node.producer, amount, node.key);
                  H.Economy.do("train", amount, node.producer, node.key, order.order);
                  H.Economy.subtract(node.costs, budget);
                  order.executed += amount;
                  log.exe.push(id + ":" + amount);
                break;

                case "build":
                  if (builds === 0){
                    // deb("    PQ: #%s construct, prod: %s, amount: %s, pos: %s, tpl: %s", id, node.producer, amount, order.order.x + "|" + order.order.z, node.key);
                    H.Economy.do("build", amount, node.producer, node.key, order.order);
                    H.Economy.subtract(node.costs, budget);
                    order.executed += amount;
                    builds += 1;
                  } else {
                    deb("    OQ: #%s build postponed", id);
                  }
                break;

                case "research":
                  H.Economy.do("research", 1, node.producer, node.key, order.order);
                  order.executed += amount;
                  log.exe.push(id + ":" + amount);
                break;

                default:
                  deb("ERROR : orderQueue: #%s unknown order.verb: %s", id, order.order.verb);

              }

            } else {
              log.ign.push(id);

            }


        });

        queue
          .filter(function(order){return order.executed >= order.order.amount;})
          .forEach(function(order){
            log.rem.push(order.order.id);
            self.remove(order);
        });

        tP = Date.now() - t0;

      }

    };

  }().boot());

  // Group assets place orders with hcq as filter, location and amount
    // order.id is taken from H.Objects
    // order.remaining is set to order.amount
    // order.processing is set to 0
    // order is appended to queue
    // queued orders are evaluated every n ticks and 
    //   if tech is researched 
    //     order is removed
    //   if order.remaining == 0 
    //     order is removed
    //   if order.remaining + order.processing = order.amount 
    //     order is ignored
    //   order.executable is set to false
    //   if n existing units or structures are available
    //     they are passed to groups
    //     order.remaining -= n
    //   if a producer exists and all requirements are met
    //     order.producer is selected
    //     order.executable = true

    // executable orders are processed every n ticks 
    // first over full amount then on single 
    //   order.unprocessed = order.remaining - order.processing
    //   if budget > order.unprocessed.cost
    //   if budget > order.single.cost
    //     if unit and producer.queue < 3
    //       order is passed to producer
    //       producer.queue += 1
    //       order.processing += order.unprocessed/single
    //       producer sends order to engine
    //     if structure
    //       producer sends order to engine
    //       order.processing += order.unprocessed/single

    // created foundations, trained units and researched techs appear later in events
    // TrainingFinished // AIMetadata
    //   H.Bot.culture.loadById(id);
    //   H.Economy.listener("onOrderReady", id, event);
    //     event.metadata.order has order.id
    //     order.processing -= 1
    //     order.remaining -= 1
    // new researchedTechs
    //   Events.dispatchEvent("onAdvance", "onAdvance", {name: name, tech: tech});

  H.Economy = (function(){

    var 
      self, goals, groups, planner, 
      phases  = ["phase.village", "phase.town", "phase.city"],
      ccid = H.Centre ? H.Centre.id : 0,

      ressTargets = {
        "food":  0,
        "wood":  0,
        "stone": 0,
        "metal": 0,
        "pop":   0,
      },

      ressGroups = [
        [1, "g.scouts",    ccid,                           1],       // depends on map size
        [1, "g.harvester", ccid,                           5],       // needed for trade?
        // [1, "g.builder",   ccid, class2name("house"),      2, 2],    // depends on building time
        // [1, "g.builder",   ccid, class2name("barracks"),   2, 1],    // depends on civ and # enemies
        // [1, "g.builder",   ccid, class2name("blacksmith"), 2, 1],    // one is max, check required techs
        [1, "g.supplier",  ccid, "metal",                  1],               // 
        [1, "g.supplier",  ccid, "stone",                  1],
        [1, "g.supplier",  ccid, "wood",                  10],
        [1, "g.supplier",  ccid, "food.fruit",             4],       // availability
        [1, "g.supplier",  ccid, "food.meat",              2],       // availability
      ];

    self = {
      boot: function(){self = this; return self;},
      init: function(){
        deb();deb();deb("   ECO: init");
        H.Events.registerListener("onAdvance", self.listener);
      },
      tick: function(secs, ticks){
        var t0 = Date.now();
        if ((ticks % H.Config.economy.intervalMonitorGoals) === 0){
          self.monitorGoals();
        }
        H.OrderQueue.process();
        H.OrderQueue.log();
        return Date.now() - t0;
      },
      listener: function(type, id, event){

        var order;

        switch(type){

          case "onAdvance":
            deb("   ECO: onAdvance: %s", uneval(arguments));
            if (phases.indexOf(event.name) !== -1){
              self.advancePhase(event.name);
            }
          break;

          case "onOrderReady" :

            order = H.Objects(event.metadata.order);
            order.remaining -= 1;
            deb("   ECO: #%s onOrderReady: id: %s, %s", order.id, id, H.Entities[id]._templateName);
            H.Objects(order.source).listener("Ready", id);  

          break;

          default:
            deb("  WARN: got unknown event in eco: %s", uneval(arguments));
        }

      },
      monitorGoals: function(){

      },
      advancePhase: function(phase){

        deb("   ECO: advancePhase '%s'", phase);
        planner  = H.Brain.requestPlanner(phase);

        // deb("     E: planner.result.data: %s", uneval(planner.result.data));

        ressTargets.food  = planner.result.data.cost.food  || 0 + planner.result.data.ress.food;
        ressTargets.wood  = planner.result.data.cost.wood  || 0 + planner.result.data.ress.wood;
        ressTargets.metal = planner.result.data.cost.metal || 0 + planner.result.data.ress.metal;
        ressTargets.stone = planner.result.data.cost.stone || 0 + planner.result.data.ress.stone;

        deb("     E: ressTargets: %s", uneval(ressTargets));

        goals  = H.Brain.requestGoals(phase);
        groups = H.Brain.requestGroups(phase);
        goals.forEach(g =>  deb("     E: goal:  %s", g));
        groups.forEach(g => deb("     E: group: %s", g));

        groups.forEach(group => {
          var [quantity, name, ccid, p1, p2, p3] = group;
          H.range(quantity).forEach(() => {
            H.Groups.launch(name, ccid, [p1, p2, p3]);
          });
        });

        // H.Groups.log();

      },
      subtract: function(cost, budget){
        budget.food  -= cost.food  > 0 ? cost.food  : 0;
        budget.wood  -= cost.wood  > 0 ? cost.wood  : 0;
        budget.metal -= cost.metal > 0 ? cost.metal : 0;
        budget.stone -= cost.stone > 0 ? cost.stone : 0;
      },
      fits: function(cost, budget){
        return (
          (cost.food  || 0) <= (budget.food  || 0) &&
          (cost.wood  || 0) <= (budget.wood  || 0) &&
          (cost.stone || 0) <= (budget.stone || 0) &&
          (cost.metal || 0) <= (budget.metal || 0)
        );  
      },
      diff: function(cost, budget){
        return {
          food:  ((cost.food  || 0) > (budget.food  || 0)) ? cost.food  - (budget.food  || 0) : undefined,
          wood:  ((cost.wood  || 0) > (budget.wood  || 0)) ? cost.wood  - (budget.wood  || 0) : undefined,
          stone: ((cost.stone || 0) > (budget.stone || 0)) ? cost.stone - (budget.stone || 0) : undefined,
          metal: ((cost.metal || 0) > (budget.metal || 0)) ? cost.metal - (budget.metal || 0) : undefined
        };
      },
      request: function(ccid, amount, order, position){

        var  // debug
          sourcename = H.Objects(order.source).name,  // this is a resource instance
          loc = (position === undefined) ? "undefined" : position.map(p => p.toFixed(1));

        order.stamp  = H.Bot.turn;
        order.id     = H.Objects(order);
        order.ccid   = ccid;
        order.amount = amount;
        if (position && position.length){
          order.x = position[0];
          order.z = position[1];
        }
        H.OrderQueue.append(new H.Order(order));

        deb("  EREQ: #%s, %s amount: %s, ccid: %s, loc: %s, from: %s, hcq: %s", order.id, order.verb, amount, ccid, loc, sourcename, order.hcq);

      },

      do: function(verb, amount, producer, template, order){

        var msg, pos, id = producer.id;

        // deb("    EDO: #%s, verb: %s, amount: %s, order: %s, tpl: %s", id, verb, amount, H.prettify(order), template);

        switch(verb){

          case "train" :
            H.Engine.train([id], template, amount, {order: order.id});
            msg = H.format("   EDO: #%s %s, trainer: %s, amount: %s, tpl: %s", order.id, verb, id, amount, template); 
          break;

          case "research" : 
            H.Engine.research(id, template);
            msg = H.format("   EDO: #%s %s researcher: %s, %s", order.id, verb, id, template); 
          break;

          case "build" : 
            if (order.x === undefined){deb("ERROR: %s without position", verb); return;}
            pos = H.Map.findGoodPosition(template, [order.x, order.z]);
            H.Engine.construct([id], template, [pos.x, pos.z, pos.angle], {order: order.id});
            msg = H.format("   EDO: #%s %s, constructor: %s, x: %s, z: %s, tpl: %s", 
                                       order.id, verb, id, order.x.toFixed(0), order.z.toFixed(0), template); 

          break;

        }

        deb(msg);

      },
      logTick: function(){

        var msg,
            stock = H.Stats.stock, 
            // stack = H.Stats.stack, 
            trend = H.Stats.trend,
            f = function(n){return n>0?"+"+n:n===0?" 0":n;},
            t = H.tab;

        msg = H.format("   ECO: F%s %s, W%s %s, M%s %s, S%s %s, P%s %s, A%s %s, H%s %s", 
          t(stock.food,   6), f(trend.food.toFixed(3)),
          t(stock.wood,   6), f(trend.wood.toFixed(3)),
          t(stock.metal,  6), f(trend.metal.toFixed(3)),
          t(stock.stone,  6), f(trend.stone.toFixed(3)),
          t(stock.pops,   4), f(trend.pops.toFixed(3)),
          t(stock.area,   4), f(trend.area.toFixed(3)),
          t(stock.health, 4), f(trend.health.toFixed(3))
        );

        deb(msg);

      }

    };

    self.listener.callsign = "economy";
    return self;

  }()).boot();


return H; }(HANNIBAL));


// H.Economy.barter = function(source, sell, buy, amount){
//   var markets = gameState.getOwnEntitiesByType(gameState.applyCiv("structures/{civ}_market"), true).toEntityArray();
//   markets[0].barter(buy,sell,100);
//   Engine.PostCommand({"type": "barter", "sell" : sellType, "buy" : buyType, "amount" : amount });      
//   new api this.barterPrices = state.barterPrices;
// };

// logObject(sharedScript.playersData[this.id].statistics);
//   buildingsConstructed: NUMBER (0)
//   buildingsLost: NUMBER (0)
//   buildingsLostValue: NUMBER (0)
//   civCentresBuilt: NUMBER (0)
//   enemyBuildingsDestroyed: NUMBER (0)
//   enemyBuildingsDestroyedValue: NUMBER (0)
//   enemyCivCentresDestroyed: NUMBER (0)
//   enemyUnitsKilled: NUMBER (0)
//   enemyUnitsKilledValue: NUMBER (0)
//   percentMapExplored: NUMBER (3)
//   resourcesBought: OBJECT (food, wood, metal, stone, ...)[4]
//   resourcesGathered: OBJECT (food, wood, metal, stone, vegetarianFood, ...)[5]
//   resourcesSold: OBJECT (food, wood, metal, stone, ...)[4]
//   resourcesUsed: OBJECT (food, wood, metal, stone, ...)[4]
//   tradeIncome: NUMBER (0)
//   treasuresCollected: NUMBER (0)
//   tributesReceived: NUMBER (0)
//   tributesSent: NUMBER (0)
//   unitsLost: NUMBER (0)
//   unitsLostValue: NUMBER (0)
//   unitsTrained: NUMBER (0)

  

// Object: playersData  ---------------
//   0: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//   1: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//   2: OBJECT (name, civ, colour, popCount, popLimit, ...)[27]
//     cheatsEnabled: BOOLEAN (false)
//     civ: STRING (athen)
//     classCounts: OBJECT (Structure, ConquestCritical, Civic, Defensive, CivCentre, ...)[19]
//     colour: OBJECT (r, g, b, a, ...)[4]
//     entityCounts: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]
//     entityLimits: OBJECT (Apadana, Council, DefenseTower, Embassy, Fortress, ...)[13]
//     heroes: ARRAY (, ...)[0]
//     isAlly: ARRAY (false, true, false, ...)[3]
//     isEnemy: ARRAY (true, false, true, ...)[3]
//     isMutualAlly: ARRAY (false, true, false, ...)[3]
//     isNeutral: ARRAY (false, false, false, ...)[3]
//     name: STRING (Player 1)
//     phase: STRING (village)
//     popCount: NUMBER (17)
//     popLimit: NUMBER (20)
//     popMax: NUMBER (300)
//     researchQueued: OBJECT (, ...)[0]
//     researchStarted: OBJECT (, ...)[0]
//     researchedTechs: OBJECT (phase_village, ...)[1]
//     resourceCounts: OBJECT (food, wood, metal, stone, ...)[4]
//     state: STRING (active)
//     statistics: OBJECT (unitsTrained, unitsLost, unitsLostValue, enemyUnitsKilled, enemyUnitsKilledValue, ...)[21]
//     team: NUMBER (-1)
//     teamsLocked: BOOLEAN (false)
//     techModifications: OBJECT (, ...)[0]
//     trainingBlocked: BOOLEAN (false)
//     typeCountsByClass: OBJECT (Structure, ConquestCritical, Civic, Defensive, CivCentre, ...)[19]



