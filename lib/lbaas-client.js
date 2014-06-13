var async = require('async');
var pkgcloud = require('pkgcloud');

var conf = require('./conf').conf;
var mysql = require('./mysql').MySQL;

var PORT_LIMIT = conf.get('portLimit');
var AUTH_CRED = conf.get('auth');

var lbaas = pkgcloud.loadbalancer.createClient({
  provider: 'rackspace',
  username: AUTH_CRED['LBaaSUser'],
  apiKey: AUTH_CRED['LBaaSPassword'],
  authUrl: AUTH_CRED['endpoint'],
  region: AUTH_CRED['region'],
});

/**
 * Returns a random port between 1024 and 65535, inclusive
 */
function generatePort() {
  return getRandomNumber(1024, 65535);
}

/**
 * Returns a random positive ineger between min and max.
 */
function getRandomNumber(min, max) {
  // ~~() negative-safe truncate magic
  return ~~(Math.random() * (max - min) + min);
}


/**
 * Helper class for the parent load balancer
 */
function ParentLoadBalancer(id, virtualIP) {
  this.id = id;
  this.virtualIP = virtualIP;
}

/**
 * Helper class for the child load balancer
 */
function ChildLoadBalancer(port,
                           privateIP, privatePort,
                           instanceUUID, datastoreType) {
  this.port = port;
  this.privateIP = privateIP;
  this.instanceUUID = instanceUUID;
  this.privatePort = privatePort;
  this.datastoreType = datastoreType;
}

/**
 * Client tool for interacting w/ CLB
 */
function LBClient() {
  // Should the lbaas object be here? this.lbaas?
  this.mysql = new mysql();
}

/*
 * Verifies the LB was created and saves off the relevant details to
 * the database.
 */
LBClient.prototype._verifyAndSaveParentLoadBalancer = function(lb,
                                                               callback) {
  //console.log("_verifyAndSaveParentLoadBalancer");
  console.log("Saving new parent load balancer " + lb['id']);

  ipv4_ips = lb['virtualIps'].filter(function(ip) {
    return ip['ipVersion'] == 'IPV4';
  });
  var parentLB = new ParentLoadBalancer(lb['id'], ipv4_ips[0]['id']);
  this.mysql.createActiveLoadBalancer(parentLB.id, parentLB.virtualIP);
  callback(null, parentLB);
}

/**
 * Creates the parent Load balancer and passes the pkgcloud LB to the
 * callback.
 */
LBClient.prototype._provisionParentLoadBalancer = function(callback) {
  lbaas.createLoadBalancer({
    name: 'dbaas-proxy-parent',
    // Even tho we dont care about this, its necessary
    protocol: pkgcloud.providers.rackspace.loadbalancer.Protocols.HTTP,
    virtualIps: [{
      type: pkgcloud.providers.rackspace.loadbalancer.VirtualIpTypes.PUBLIC,
    }]
  }, function(err, pkgcloudLB) {
    if (err) {
      callback(err);
    } else {
      callback(null, pkgcloudLB);
    }
  });
}

/**
 * Creates a child load balancer using the port and privateIP from the
 * state map. Sticks the 'remoteLoadBalancer' object into the state
 * map when finished creating the load balancer.
 */
LBClient.prototype._provisionChildLoadBalancer = function(state, callback) {
  console.log("_provisionChildLoadBalancer");
  var childLoadBalancer = state['childLoadBalancer'];
  var parentLoadBalancer = state['parentLoadBalancer'];

  lbaas.createLoadBalancer({
    name: 'dbaas-proxy-child',
    protocol: {name:"TCP", port: childLoadBalancer.port},
    virtualIps: [{
      id: parentLoadBalancer.virtualIP
    }],
    nodes: [{
      address: childLoadBalancer.privateIP,
      port: childLoadBalancer.privatePort,
      condition: 'ENABLED',
    }]
  }, function(err, pkgcloudLB) {
    if (err) {
      callback(err);
    } else {
      state['remoteLoadBalancer'] = pkgcloudLB;
      callback(null)
    }
  });
}

/**
 * Creates a parent load balancer through the LBaaS API. This utilizes
 * a waterall, but needs to be fixed to use a series. Waterfall is the
 * tool of the devil because it relies on passing data between the
 * callbacks.
 */
LBClient.prototype.createParentLoadBalancer = function(callback) {
  console.log("createParentLoadBalancer");
  async.waterfall([
    this._provisionParentLoadBalancer.bind(this),
    this._verifyAndSaveParentLoadBalancer.bind(this),
  ], callback);
}

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
LBClient.prototype._scheduleLoadBalancer = function(state, callback) {
  console.log("_scheduleLoadBalancer");
  self = this;
  this.mysql.retrieveActiveLoadBalancers(function(err, results) {
    // If there are no active load balancers, spin up a new one
    if (err) {
      console.log("error in retrieving active load balancers");
      console.log(err);
      callback(err);
      return;
    }
    if (results.length === 0) {
      self.createParentLoadBalancer(callback);
      console.log("i havent finished this path yet");
    } else {
      // get just the first result, there may be more than one active
      // load balancer due to deletes.
      var activeLB = results[0];

      var parentLoadBalancer = new ParentLoadBalancer(
        activeLB['load_balancer_id'],
        activeLB['virtual_ip_id']);
      state['parentLoadBalancer'] = parentLoadBalancer;
      callback(null);
    }
  });
}

/**
 * Creates the database entry for a child load balancer. This function
 * makes sure that no duplicate port/parent load balancer combinations
 * exist. If the port is a duplicate (mysql unique contraint error), a
 * new port is generated for use. The port is saved into the state map
 * for further processing. The ID of the database row is also saved in
 * the ChildLoadBalancer object, so that it can be retrieved later to
 * update the row.
 */
LBClient.prototype._saveChildLoadBalancer = function(state, callback) {

  var childLoadBalancer = state['childLoadBalancer'];
  var parentLoadBalancer = state['parentLoadBalancer'];
  var self = this;

  childLoadBalancer.port = generatePort();

  // Validate logic for port duplication
  var duplicatePortCheck = function(err, result) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      // found a duplicate port/ip combo. skip it and retry
      console.log("A duplicate port was found:", childLoadBalancer.port);

      self._saveChildLoadBalancer(state, callback);

    } else {
      // Grab the id from the result and give it to the child lb. It
      // is more effecient than doing an update on the port/parent
      // load balancer combination, so we will use it later to update
      // w/ the load balancer id retreived through CLB
      childLoadBalancer.insertId = result.insertId;
      // good port found, continue in the async flow
      callback(null);

    }
  }

  this.mysql.createChildLoadBalancer(parentLoadBalancer.id,
                                     childLoadBalancer.port,
                                     childLoadBalancer.instanceUUID,
                                     childLoadBalancer.datastoreType,
                                     childLoadBalancer.privateIP,
                                     duplicatePortCheck);
}

/**
 * Updates the child load balancer with the remote load balancers
 * actual ID. This uses the inserted row's ID previously retrieved
 * when saving the row initially.
 */
LBClient.prototype._updateChildLoadBalancer = function(state, callback) {
  var remoteLoadBalancer = state['remoteLoadBalancer'];
  var childLoadBalancer = state['childLoadBalancer'];
  this.mysql.updateChildLoadBalancer(childLoadBalancer.insertId,
                                     remoteLoadBalancer['id']);
  // This might should be in a callback in the update call above...?
  callback(null);
}

/**
 * Creates a 'child' load balancer. This will generate a port mapping
 * and validate that it does not conflict with the other ports on the
 * load balancer before creating the child load balancer. It will save
 * the state to the database as well.
 */
LBClient.prototype.createLoadBalancerWithNode = function(privateIP,
                                                         privatePort,
                                                         instanceUUID,
                                                         datastoreType,
                                                         callback) {
  console.log("createLoadBalancerWithNode");
  var childLoadBalancer = new ChildLoadBalancer(null, privateIP,
                                                privatePort, instanceUUID,
                                                datastoreType)
  var state = {childLoadBalancer: childLoadBalancer};

    async.series([
      this._scheduleLoadBalancer.bind(this, state),
      this._saveChildLoadBalancer.bind(this, state),
      this._provisionChildLoadBalancer.bind(this, state),
      this._updateChildLoadBalancer.bind(this,state),
    ], function(err, results) {
      callback(err, state);
    });
}

exports.LBClient = LBClient
