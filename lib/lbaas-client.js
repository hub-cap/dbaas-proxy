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

function ParentLoadBalancer(id, virtualIP) {
  this.id = id;
  this.virtualIP = virtualIP;
}

/**
 *
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

LBClient.prototype._provisionChildLoadBalancer = function(port,
                                                          privateIP,
                                                          privatePort,
                                                          parentLB,
                                                          callback) {
  console.log("_provisionChildLoadBalancer");
  lbaas.createLoadBalancer({
    name: 'dbaas-proxy-child',
    // Even tho we dont care about this, its necessary
    protocol: {name:"TCP", port: port},
    virtualIps: [{
      id: parentLB.virtualIP
    }],
    nodes: [{
      address: privateIP,
      port: privatePort,
      condition: 'ENABLED',
    }]
  }, function(err, pkgcloudLB) {
    if (err) {
      callback(err);
    } else {
      callback(null, parentLB, pkgcloudLB);
    }
  });
}

/**
 * Creates a parent load balancer through the LBaaS API.
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
 * If there are no active load balancer, call
 * createParentLoadBalancer to create a new LB and return that.
 */
LBClient.prototype._scheduleLoadBalancer = function(schedule_callback) {
  console.log("_scheduleLoadBalancer");
  self = this;
  this.mysql.retrieveActiveLoadBalancers(function(err, results) {
    // If there are no active load balancers, spin up a new one
    if (err) {
      console.log("error in retrieving active load balancers");
      console.log(err);
      schedule_callback(err);
      return;
    }
    if (results.length === 0) {
      self.createParentLoadBalancer(schedule_callback)
    } else {
      // get just the first result
      activeLB = results[0];
      // Need to validate ports here and update it if need be
      schedule_callback(null,
                        new ParentLoadBalancer(activeLB['load_balancer_id'],
                                               activeLB['virtual_ip_id']));
    }
  });
}

LBClient.prototype._saveChildLoadBalancer = function(instanceUUID,
                                                     datastoreType,
                                                     port,
                                                     privateIP,
                                                     parentLB,
                                                     pkgcloudLB,
                                                     callback) {

  this.mysql.createChildLoadBalancer(pkgcloudLB['id'],
                                     parentLB.id,
                                     port,
                                     instanceUUID,
                                     datastoreType,
                                     privateIP);
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
  var port = generatePort();
    async.waterfall([
      this._scheduleLoadBalancer.bind(this),
      this._provisionChildLoadBalancer.bind(this, port, privateIP,
                                            privatePort),
      this._saveChildLoadBalancer.bind(this, instanceUUID, datastoreType,
                                       port, privateIP),
    ], callback);
}

exports.LBClient = LBClient
