var pkgcloud = require('pkgcloud');
var lbaas = pkgcloud.loadbalancer.createClient({
  provider: 'rackspace',
  username: 'fixme',
  apiKey: 'fixme',
  authUrl: 'https://identity.api.rackspacecloud.com',
  region: 'ORD',
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
 *
 */
function LBClient() {
  // Should the lbaas object be here? this.lbaas?
}

/*
 * Verifies the LB was created and saves off the relevant details to
 * the database.
 */
LBClient.prototype._verifyAndSaveParentLoadBalancer = function(err, lb) {
  if (err != null) {
    console.log("Could not create a new parent load balancer");
    console.log(err);
    return;
  }
  console.log("Saving " + lb);
  // save this to the mysql datastore for further use
}

/**
 * Creates a parent load balancer through the LBaaS API.
 */
LBClient.prototype.createParentLoadBalancer = function() {
  lbaas.createLoadBalancer({
    name: 'dbaas-proxy-parent',
    // Even tho we dont care about this, its necessary
    protocol: pkgcloud.providers.rackspace.loadbalancer.Protocols.HTTP,
    virtualIps: [{
      type: pkgcloud.providers.rackspace.loadbalancer.VirtualIpTypes.PUBLIC,
    }],
  }, this._verifyAndSaveParentLoadBalancer.bind(this));
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
LBClient.prototype._scheduleLoadBalancer = function() {
}

/**
 * Creates a 'child' load balancer. This will generate a port mapping
 * and validate that it does not conflict with the other ports on the
 * load balancer before creating the child load balancer. It will save
 * the state to the database as well.
 */
LBClient.prototype.createLoadBalancerWithNode = function(privateIP) {
  //retrieve an active load balancer, sequentially
  activeLoadBalancer = this._scheduleLoadBalancer();
  //call create on the new LB using the existing VirtualIP
  //then create the LoadBalancerNode entry w the port
  port = generatePort();
}

exports.LBClient = LBClient
