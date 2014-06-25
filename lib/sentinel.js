var conf = require('./conf').conf;
var redis = require('redis');

var LoadBalancerFlow = require('./lbaas-client').LoadBalancerFlow;
var REDIS_CRED = conf.get('redis');
var SENTINEL_MON = conf.get('sentinel-monitor');
var SENTINELS = conf.get('sentinels');
var LOGGER = require('./log').LOG;

var printError = function (err, data) {
  if (err) {
    LOGGER.error(err);
  } else {
    LOGGER.log("completed operation on", data.childLoadBalancer);
    //LOGGER.log(data);
  }
};

function Sentinel() {
  this.clients = SENTINELS.map(function(item) {
    return redis.createClient(item.port, item.host,
                              {retry_max_delay: 60*1000});
  });
}

Sentinel.prototype.addNodeToSentinel = function (name,
                                                        ip,
                                                        port,
                                                        password,
                                                        callback) {
  var errorFunc = function(err, result) {
    if (err) {
      callback(err);
    }
  };
  LOGGER.debug("adding Masters to sentinel(s)");
  // run the commands on all the clients
  this.clients.map(function(client) {

    client.send_command(
      'sentinel',
      ['monitor', name, ip, port, 2],
      errorFunc);

    client.send_command(
      'sentinel',
      ['set', name, 'down-after-milliseconds', '3000'],
      errorFunc);

    client.send_command(
      'sentinel',
      ['set', name, 'auth-pass', password],
      errorFunc);
  });

  callback(null);
};

Sentinel.prototype.removeNodeFromSentinel = function (name,
                                                      callback) {
  var errorFunc = function(err, result) {
    if (err) {
      callback(err);
    }
  };
  LOGGER.debug("removing Masters from sentinel(s)");
  // run the commands on all the clients
  this.clients.map(function(client) {
    client.send_command(
      'sentinel',
      ['remove', name],
      errorFunc);
  });
  callback(null);
};

module.exports.Sentinel = Sentinel
