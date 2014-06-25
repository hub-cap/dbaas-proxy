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

function FailoverMonitor() {
  var sentinel = redis.createClient(SENTINEL_MON.port,
                                SENTINEL_MON.host,
                                {retry_max_delay: 60*1000});
  //                             {auth_pass:'<some-master-password>'});

  sentinel.on('message', function (channel, message) {
    console.log('client channel ' + channel + ': ' + message);
    // Get the newip from the list and tell lbaas its time to flip it
    //<master name> <oldip> <oldport> <newip> <newport>
    contents = message.split(' ')
    new LoadBalancerFlow().promoteToMaster(contents[0],
                                           contents[3],
                                           printError);
  });
  LOGGER.debug("monitor subscribing to +switch-master");

  sentinel.subscribe('+switch-master');
};

module.exports.FailoverMonitor = FailoverMonitor
