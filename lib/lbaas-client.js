var async = require('async');
var pkgcloud = require('pkgcloud');
var redis = require('redis');

var conf = require('./conf').conf;
var createDNS = require('./dns').createDNS;
var mysql = require('./mysql');
var Sentinel = require('./sentinel').Sentinel;
var util = require('./util');

var PORT_LIMIT = conf.get('portLimit');
var AUTH_CRED = conf.get('auth');
var REDIS_CRED = conf.get('redis');
var LOGGER = require('./log').LOG;

var MYSQL_CLIENT = new mysql.MySQL();
MYSQL_CLIENT.connect();

function createPkgCloudClient() {
  return pkgcloud.loadbalancer.createClient({
    provider: 'rackspace',
    username: AUTH_CRED.LBaaSUser,
    apiKey: AUTH_CRED.LBaaSPassword,
    authUrl: AUTH_CRED.endpoint,
    region: AUTH_CRED.region
  });
}

function createRedisClient() {
  return redis.createClient(REDIS_CRED.port,
                            REDIS_CRED.host,
                            {retry_max_delay: 60 * 1000}
                           );
}

function LoadBalancerFlow() {
  this.state = {};
  this.pkgCloudClient = createPkgCloudClient();
  this.sentinel = new Sentinel();
}

/**
 * Creates a 'child' load balancer. This will generate a port mapping
 * and validate that it does not conflict with the other ports on the
 * load balancer before creating the child load balancer. It will save
 * the state to the database as well.
 */
LoadBalancerFlow.prototype.createLoadBalancer = function (privateIP,
                                                          privatePort,
                                                          instanceUUID,
                                                          datastoreType,
                                                          vipUUID,
                                                          password,
                                                          callback) {

  this.state.childLoadBalancer = {privateIP: privateIP,
                                  privatePort: privatePort,
                                  instanceUUID: instanceUUID,
                                  vipUUID: vipUUID,
                                  password: password,
                                  datastoreType: datastoreType};

  async.series([
    this._scheduleLoadBalancer.bind(this),
    this._saveLoadBalancer.bind(this),
    this._provisionLoadBalancer.bind(this),
    this._addDNSRecord.bind(this),
    this._updateLoadBalancer.bind(this),
    this._updateLoadBalancerNodeID.bind(this),
    this._addMasterToSentinel.bind(this)
  ], this._completedFlow.bind(this, callback));
};

LoadBalancerFlow.prototype._addDNSRecord = function (callback) {
  var self = this;
  createDNS(this.state.childLoadBalancer.vipUUID,
            this.state.parentLoadBalancer.virtualIP.address,
            function(err, result) {
              if (!err) {
                self.state.childLoadBalancer.dns = result.name;
              }
              callback(err);
            });
}

LoadBalancerFlow.prototype._addMasterToSentinel = function (callback) {
  this.sentinel.addNodeToSentinel(
    this.state.childLoadBalancer.vipUUID,
    this.state.childLoadBalancer.privateIP,
    this.state.childLoadBalancer.privatePort,
    this.state.childLoadBalancer.password,
    callback
  );
};

LoadBalancerFlow.prototype._removeMasterFromSentinel = function (callback) {
  this.sentinel.removeNodeFromSentinel(
    this.state.childLoadBalancer.vipUUID,
    callback
  );
};

/*
 * Logs any info upon completion of a create flow.
 */
LoadBalancerFlow.prototype._completedFlow = function (callback,
                                                      err, results) {
  LOGGER.debug(this.state);
  callback(err, this.state);
};

/**
 * Finds an active load balancer sequentially, making sure to deal
 * with race conditions associated with pulling data. If the LB has
 * X-1 ports assigned to it, mark it as active=false so its not picked
 * up by another schedule call.
 *
 * If there are no active load balancer, call
 * createParentLoadBalancer to create a new LB and return that.
 *
 * todo: add the X-1 port logic and create new active load balancers.
 */
LoadBalancerFlow.prototype._scheduleLoadBalancer = function (callback) {
  var self = this;
  MYSQL_CLIENT.retrieveActiveLoadBalancers(PORT_LIMIT, function (err, results) {
    // If there are no active load balancers, spin up a new one
    if (err) {
      LOGGER.error("error in retrieving active load balancers");
      LOGGER.error(err);
      callback(err);
      return;
    }
    if (results.length === 0) {
      self.createParentLoadBalancer(callback);
    } else {
      // get just the first result, there may be more than one active
      // load balancer due to deletes.
      var activeLB = results[0];

      self.state.parentLoadBalancer = {id: activeLB.load_balancer_id,
                                       virtualIP: {id: activeLB.virtual_ip_id,
                                                   address: activeLB.address}};
      callback(null);
    }
  });
};

/**
 * Creates the database entry for a child load balancer. This function
 * makes sure that no duplicate port/parent load balancer combinations
 * exist. If the port is a duplicate (mysql unique contraint error), a
 * new port is generated for use. The port is saved into the state manp
 * for further processing. The ID of the database row is also saved in
 * the ChildLoadBalancer object, so that it can be retrieved later to
 * update the row.
 */
LoadBalancerFlow.prototype._saveLoadBalancer = function (callback) {
  var self = this;
  // Validate logic for port duplication
  var duplicatePortCheck = function (err, result) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      // found a duplicate port/ip combo. skip it and retry
      LOGGER.debug("A duplicate port was found:",
                  self.state.childLoadBalancer.port);

      self._saveLoadBalancer(callback);

    } else {
      // Grab the id from the result and give it to the child lb. It
      // is more effecient than doing an update on the port/parent
      // load balancer combination, so we will use it later to update
      // w/ the load balancer id retreived through CLB
      self.state.childLoadBalancer.insertId = result.insertId;
      // good port found, continue in the async flow
      callback(null);
    }
  };

  this.state.childLoadBalancer.port = util.generatePort();

  MYSQL_CLIENT.createChildLoadBalancer(this.state.childLoadBalancer.vipUUID,
                                       this.state.parentLoadBalancer.id,
                                       this.state.childLoadBalancer.port,
                                       this.state.childLoadBalancer.instanceUUID,
                                       this.state.childLoadBalancer.datastoreType,
                                       this.state.childLoadBalancer.privateIP,
                                       this.state.childLoadBalancer.privatePort,
                                       duplicatePortCheck);
};

/**
 * Creates a child load balancer using the port and privateIP from the
 * state map. Sticks the 'remoteLoadBalancer' object into the state
 * map when finished creating the load balancer.
 */
LoadBalancerFlow.prototype._provisionLoadBalancer = function (callback) {
  LOGGER.debug("_provisionChildLoadBalancer");

  var remoteLoadBalancer = {
    name: 'dbaas-proxy-' + this.state.childLoadBalancer.vipUUID,
    protocol: {name: "TCP_CLIENT_FIRST",
               port: this.state.childLoadBalancer.port},
    virtualIps: [{
      id: this.state.parentLoadBalancer.virtualIP.id
    }],
    nodes: [{
      address: this.state.childLoadBalancer.privateIP,
      port: this.state.childLoadBalancer.privatePort,
      type: 'PRIMARY',
      condition: 'ENABLED'
    }]
  };

  util.retryCall(10, this.pkgCloudClient,
                 this.pkgCloudClient.createLoadBalancer,
                 remoteLoadBalancer,
                 this._savePkgCloudLB.bind(this, callback));
};

/**
 * Puts the 'remoteLoadBalancer' into the state map for further processing
 */
LoadBalancerFlow.prototype._savePkgCloudLB = function (callback,
                                                       err, pkgCloudObj) {

  // check if its a node (array) or LB
  if (pkgCloudObj instanceof Array) {
    // In order to behave the same way as a pkgCloudLB, we need to
    // hack the nodeID into the nodes: variable, and use a structure
    // it expects
    this.state.remoteLoadBalancer = { nodes: [{id: pkgCloudObj[0].id}]};
  } else {
    this.state.remoteLoadBalancer = {id: pkgCloudObj.id,
                                     nodes: pkgCloudObj.nodes};
  }
  callback(err);
};

/**
 * Updates the child load balancer with the remote load balancers
 * actual ID. This uses the inserted row's ID previously retrieved
 * when saving the row initially.
 */
LoadBalancerFlow.prototype._updateLoadBalancer = function (callback) {
  MYSQL_CLIENT.updateChildLoadBalancer(this.state.childLoadBalancer.vipUUID,
                                       this.state.remoteLoadBalancer.id,
                                       this.state.childLoadBalancer.dns);
  // This might should be in a callback in the update call above...?
  callback(null);
};

LoadBalancerFlow.prototype._updateLoadBalancerNodeID = function (callback) {
  MYSQL_CLIENT.setLoadBalancerNodeID(
    this.state.remoteLoadBalancer.nodes[0].id,
    this.state.childLoadBalancer.vipUUID
  );
  // This might should be in a callback in the update call above...?
  callback(null);
};

/**
 * Creates a load balancer that is mostly unused. Its a placeholder
 * load balancer for an IP/port/customer combination which is a child
 * node.
 */
LoadBalancerFlow.prototype.createParentLoadBalancer = function (callback) {
  async.series([
    this._provisionParentLoadBalancer.bind(this),
    this._saveParentLoadBalancer.bind(this)
  ], callback);
};

/**
 * Creates the parent Load balancer and passes the pkgcloud LB to the
 * callback.
 */
LoadBalancerFlow.prototype._provisionParentLoadBalancer = function (callback) {
  var remoteLoadBalancer = {
    name: 'dbaas-proxy-parent',
    // Even tho we dont care about this, its necessary
    protocol: pkgcloud.providers.rackspace.loadbalancer.Protocols.HTTP,
    virtualIps: [{
      type: pkgcloud.providers.rackspace.loadbalancer.VirtualIpTypes.PUBLIC
    }]
  };

  util.retryCall(10, this.pkgCloudClient,
                 this.pkgCloudClient.createLoadBalancer,
                 remoteLoadBalancer,
                 this._saveParentPkgCloudLB.bind(this, callback));
};

/**
 * Takes a load balancer from pkgcloud and saves off the information
 * into the state map.
 */
LoadBalancerFlow.prototype._saveParentPkgCloudLB = function (callback,
                                                       err, pkgCloudLB) {

  var ipv4_ips = pkgCloudLB.virtualIps.filter(function (ip) {
    return ip.ipVersion === 'IPV4';
  });
  this.state.parentLoadBalancer = {id: pkgCloudLB.id,
                                   virtualIP: ipv4_ips[0]};
  callback(err);
};

LoadBalancerFlow.prototype._saveParentLoadBalancer = function (callback) {
  MYSQL_CLIENT.createActiveLoadBalancer(
    this.state.parentLoadBalancer.id,
    this.state.parentLoadBalancer.virtualIP.id,
    this.state.parentLoadBalancer.virtualIP.address,
    callback
  );
};

LoadBalancerFlow.prototype.deleteLoadBalancer = function (vipUUID,
                                                          callback) {
  this.state.childLoadBalancer = {vipUUID: vipUUID};
  async.series([
    this._retrieveChildLoadBalancer.bind(this),
    this._deprovisionLoadBalancer.bind(this),
    this._deleteChildLoadBalancer.bind(this),
    this._removeMasterFromSentinel.bind(this)
  ], this._completedFlow.bind(this, callback));
};

LoadBalancerFlow.prototype._deprovisionLoadBalancer = function (callback) {
  util.retryCall(10, this.pkgCloudClient,
                 this.pkgCloudClient.deleteLoadBalancer,
                 this.state.childLoadBalancer.loadBalancerID,
                 callback);
};

LoadBalancerFlow.prototype._deleteChildLoadBalancer = function (callback) {
  MYSQL_CLIENT.deleteChildLoadBalancer(this.state.childLoadBalancer.id);
  callback(null);
};


LoadBalancerFlow.prototype.createSecondaryNode = function (vipUUID,
                                                           instanceUUID,
                                                           privateIP,
                                                           callback) {
  this.state.childLoadBalancer = { vipUUID: vipUUID,
                                   instanceUUID: instanceUUID,
                                   privateIP: privateIP
                                 };

  async.series([
    this._retrieveChildLoadBalancer.bind(this),
    this._provisionSecondaryNode.bind(this),
    this._updateSecondaryNode.bind(this)
  ], this._completedFlow.bind(this, callback));
};

LoadBalancerFlow.prototype._retrieveChildLoadBalancer = function (callback) {
  var self = this;
  MYSQL_CLIENT.retrieveChildLoadBalancer(
    this.state.childLoadBalancer.vipUUID,
    function (err, results) {
      if (err) {
        callback(err);
        return;
      }
      var childLoadBalancer = results[0];
      self.state.childLoadBalancer.loadBalancerID = childLoadBalancer.load_balancer_id;
      self.state.childLoadBalancer.privatePort = childLoadBalancer.private_port;
      self.state.childLoadBalancer.id = childLoadBalancer.id;
      callback(null);
    }
  );
};

LoadBalancerFlow.prototype._provisionSecondaryNode = function (callback) {
  var nodes = [{
    address: this.state.childLoadBalancer.privateIP,
    port: this.state.childLoadBalancer.privatePort,
    type: 'SECONDARY',
    condition: 'DISABLED'
  }];

  util.retryCall(10, this.pkgCloudClient,
                 this.pkgCloudClient.addNodes,
                 this.state.childLoadBalancer.loadBalancerID,
                 nodes,
                 this._savePkgCloudLB.bind(this, callback));
};

LoadBalancerFlow.prototype._updateSecondaryNode = function (callback) {

  MYSQL_CLIENT.createLoadBalancerNode(this.state.childLoadBalancer.instanceUUID,
                                      this.state.childLoadBalancer.vipUUID,
                                      this.state.childLoadBalancer.privateIP,
                                      false,
                                      // this is the node_id
                                      this.state.remoteLoadBalancer.nodes[0].id,
                                      callback);
};

LoadBalancerFlow.prototype.promoteToMaster = function (vipUUID,
                                                       privateIP,
                                                       callback) {
  this.state.childLoadBalancer = { vipUUID: vipUUID,
                                   privateIP: privateIP
                                 };

  async.series([
    this._retrieveChildLoadBalancer.bind(this),
    this._retrieveLoadBalancerNodes.bind(this),
    this._promoteNode.bind(this),
    this._updatePromotedNode.bind(this)
  ], this._completedFlow.bind(this, callback));
};

LoadBalancerFlow.prototype._retrieveLoadBalancerNodes = function (callback) {
  var self = this;
  this.state.nodes = [];
  MYSQL_CLIENT.retrieveLoadBalancerNodes(
    this.state.childLoadBalancer.vipUUID,
    function (err, results) {
      if (err) {
        callback(err);
        return;
      }
      results.map(function (node) {
        this.state.nodes.push({
          address: node.private_ip,
          port: this.state.childLoadBalancer.privatePort,
          type: node.primary_node,
          node_id: node.node_id
        });
      }, self);

      callback(null);
    }
  );
};

LoadBalancerFlow.prototype._retryNodeCall = function (retries,
                                                      node) {
  var numTimes = 0;
  var self = this;
  var timer;
  var updateNode = function (id, node, callback) {
    numTimes++;
    self.pkgCloudClient.updateNode(id, node, callback);
  };

  LOGGER.debug("retrying update Node on ",
               this.state.childLoadBalancer.loadBalancerID);
  timer = setInterval(
    updateNode,
    10 * 1000,
    this.state.childLoadBalancer.loadBalancerID,
    node,
    function (err, results) {
      if (err) {
        // just keep doing it or fail if we hit 5
        LOGGER.error(err);
        if (numTimes >= retries) {
          clearInterval(timer);
        }
      } else {
        // call the callback and cancel this sucker
        clearInterval(timer);
      }
    }
  );
};

LoadBalancerFlow.prototype._promoteNode = function (callback) {
  // check privatePort, if its the port, then it becomes the primary
  var self = this;
  this.state.nodes.map(function (node) {
    var items = {
      id: node.node_id
    };
    if (this.state.childLoadBalancer.privateIP === node.address) {
      // it is the new master
      items.condition = 'ENABLED';
      items.type = 'PRIMARY';
    } else {
      items.condition = 'DISABLED';
      items.type = 'SECONDARY';
    }
    this.pkgCloudClient.updateNode(
      this.state.childLoadBalancer.loadBalancerID,
      items,
      function (err, result) {
        if (err) {
          LOGGER.error(err);
          self._retryNodeCall(50, items);
        }
      }
    );

  }, this);

  callback(null);

};

LoadBalancerFlow.prototype._updatePromotedNode = function (callback) {
  MYSQL_CLIENT.updatePromotedNode(
    this.state.childLoadBalancer.id,
    this.state.childLoadBalancer.privateIP
  );
  callback(null);
};

LoadBalancerFlow.prototype.retrieveLoadBalancerDetails = function (id,
                                                                   callback) {
  MYSQL_CLIENT.retrieveLoadBalancerDetails(id, callback);
};

module.exports.LoadBalancerFlow = LoadBalancerFlow;
