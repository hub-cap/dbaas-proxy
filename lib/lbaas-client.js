var async = require('async');
var pkgcloud = require('pkgcloud');

var conf = require('./conf').conf;
var mysql = require('./mysql');
var util = require('./util');

var PORT_LIMIT = conf.get('portLimit');
var AUTH_CRED = conf.get('auth');

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

function LoadBalancerFlow() {
  this.state = {};
  this.pkgCloudClient = createPkgCloudClient();
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
                                                          callback) {

  this.state.childLoadBalancer = {privateIP: privateIP,
                                  privatePort: privatePort,
                                  instanceUUID: instanceUUID,
                                  datastoreType: datastoreType};

  async.series([
    this._scheduleLoadBalancer.bind(this),
    this._saveLoadBalancer.bind(this),
    this._provisionLoadBalancer.bind(this),
    this._updateLoadBalancer.bind(this)
  ], this._completedCreateFlow.bind(this, callback));
};

/*
 * Logs any info upon completion of a create flow.
 */
LoadBalancerFlow.prototype._completedCreateFlow = function (callback,
                                                            err, results) {
  console.log(this.state);
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
  MYSQL_CLIENT.retrieveActiveLoadBalancers(function (err, results) {
    // If there are no active load balancers, spin up a new one
    if (err) {
      console.log("error in retrieving active load balancers");
      console.log(err);
      callback(err);
      return;
    }
    if (results.length === 0) {
      //self.createParentLoadBalancer(callback);
      console.log("i havent finished this path yet");
    } else {
      // get just the first result, there may be more than one active
      // load balancer due to deletes.
      var activeLB = results[0];

      self.state.parentLoadBalancer = {id: activeLB.load_balancer_id,
                                       virtualIP: activeLB.virtual_ip_id};
      callback(null);
    }
  });
};

/**
 * Creates the database entry for a child load balancer. This function
 * makes sure that no duplicate port/parent load balancer combinations
 * exist. If the port is a duplicate (mysql unique contraint error), a
 * new port is generated for use. The port is saved into the state map
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
      console.log("A duplicate port was found:",
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

  MYSQL_CLIENT.createChildLoadBalancer(this.state.parentLoadBalancer.id,
                                       this.state.childLoadBalancer.port,
                                       this.state.childLoadBalancer.instanceUUID,
                                       this.state.childLoadBalancer.datastoreType,
                                       this.state.childLoadBalancer.privateIP,
                                       duplicatePortCheck);
};

/**
 * Creates a child load balancer using the port and privateIP from the
 * state map. Sticks the 'remoteLoadBalancer' object into the state
 * map when finished creating the load balancer.
 */
LoadBalancerFlow.prototype._provisionLoadBalancer = function (callback) {
  console.log("_provisionChildLoadBalancer");

  var remoteLoadBalancer = {
    name: 'dbaas-proxy-child',
    protocol: {name: "TCP", port: this.state.childLoadBalancer.port},
    virtualIps: [{
      id: this.state.parentLoadBalancer.virtualIP
    }],
    nodes: [{
      address: this.state.childLoadBalancer.privateIP,
      port: this.state.childLoadBalancer.privatePort,
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
                                                       err, pkgCloudLB) {
  this.state.remoteLoadBalancer = pkgCloudLB;
  callback(err);
};

/**
 * Updates the child load balancer with the remote load balancers
 * actual ID. This uses the inserted row's ID previously retrieved
 * when saving the row initially.
 */
LoadBalancerFlow.prototype._updateLoadBalancer = function (callback) {
  MYSQL_CLIENT.updateChildLoadBalancer(this.state.childLoadBalancer.insertId,
                                     this.state.remoteLoadBalancer.id);
  // This might should be in a callback in the update call above...?
  callback(null);
};

module.exports.LoadBalancerFlow = LoadBalancerFlow;
