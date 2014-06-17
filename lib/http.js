KeystoneClient = require('keystone-client').KeystoneClient
var express = require('express');
var bodyParser = require('body-parser');
var LBClient = require('./lbaas-client').LBClient;

var lbaas = new LBClient();
var app = express();
var router = express.Router();

function printError(err, data) {
  if (err) {
    console.log(err);
  } else {
    console.log(data);
  }
}

KeystoneMiddleware = function() {
  return function(req, res, next) {
    var token = req.get('X-Auth-Token');
    var user = req.get('X-Auth-User');
    console.log("zomg", token, user);
    // This is invalid and only a test for now, it needs to do the commentd
    // method below and should not take in a username / password
    ks = new KeystoneClient(
      'https://identity.api.rackspacecloud.com/v2.0/',
      {apiKey:token,
       username:user})
    // Need to do some sort of on-behalf-of to validate if
    // this is a real user requesting the IP
    //ks.validateTokenForTenant <-- this method only requires a admin token
    ks._updateToken(function(err, data) { console.log(err, data)});
    next();
  }
}

module.exports.createExpressServer = function () {
  app.use(bodyParser());
  // Enable this once we have a service token
  //app.use(KeystoneMiddleware());
  app.listen(9000);

  router.post('/', function (req, res) {
    lbaas.createLoadBalancerWithNode("10.176.168.145", 3306,
                                     "some-uuid", "mysql5.5",
                                     printError
                                    );

    res.send("posted sir\n");
  });

  app.use('/', router);
};
