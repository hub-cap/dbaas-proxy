KeystoneClient = require('keystone-client').KeystoneClient
var express = require('express');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var util = require('util');
var LoadBalancerFlow = require('./lbaas-client').LoadBalancerFlow;

var app = express();
var router = express.Router();

function printError(err, data) {
  if (err) {
    console.log(err);
  } else {
    console.log("provisioned", data.childLoadBalancer.insertId);
    //console.log(data);
  }
}

KeystoneMiddleware = function() {
  return function(req, res, next) {
    var token = req.get('X-Auth-Token');
    var user = req.get('X-Auth-User');

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
  app.use(expressValidator());
  // Enable this once we have a service token
  //app.use(KeystoneMiddleware());
  app.listen(9000);

  router.post('/', function (req, res) {
    console.log(req.body);
    req.checkBody('IP', 'Invalid IP').isIP();
    req.checkBody('port', 'Invalid Port').isNumeric();
    req.checkBody('uuid', 'Invalid UUID').isUUID();
    req.checkBody('datastoreType', 'Invalid datastore').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
      res.send(util.inspect(errors), 400);
    } else {
      new LoadBalancerFlow().createLoadBalancer(req.body.IP,
                                                req.body.port,
                                                req.body.uuid,
                                                req.body.datastoreType,
                                                printError);
      res.send('', 200);
    }

  });

  app.use('/', router);
};
