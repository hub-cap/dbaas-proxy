var redis = require('redis');
var LoadBalancerFlow = require('./lbaas-client').LoadBalancerFlow;
var LOGGER = require('./log').LOG;

var printError = function (err, data) {
  if (err) {
    LOGGER.error(err);
  } else {
    LOGGER.log("completed operation on", data.childLoadBalancer);
    //LOGGER.log(data);
  }
};


sentinel = redis.createClient(26379, '104.130.10.193',{});
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

sentinel.subscribe('+switch-master');
