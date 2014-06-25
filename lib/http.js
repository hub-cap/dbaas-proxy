var KeystoneClient = require('keystone-client').KeystoneClient;
var express = require('express');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var util = require('util');
var uuid = require('uuid');
var LoadBalancerFlow = require('./lbaas-client').LoadBalancerFlow;

var LOGGER = require('./log').LOG;
var app = express();
var router = express.Router();

var printError = function (err, data) {
  if (err) {
    LOGGER.error(err);
  } else {
    LOGGER.log("completed operation on", data.childLoadBalancer);
    //LOGGER.log(data);
  }
};

var KeystoneMiddleware = function () {
  return function (req, res, next) {
    var token = req.get('X-Auth-Token');
    var user = req.get('X-Auth-User');

    // This is invalid and only a test for now, it needs to do the commentd
    // method below and should not take in a username / password
    var ks = new KeystoneClient('https://identity.api.rackspacecloud.com/v2.0/',
                                {apiKey: token,
                                 username: user}
                               );
    // Need to do some sort of on-behalf-of to validate if
    // this is a real user requesting the IP
    //ks.validateTokenForTenant <-- this method only requires a admin token
    ks._updateToken(function (err, data) {
      LOGGER.debug(err, data);
    });
    next();
  };
};

module.exports.createExpressServer = function () {
  app.use(bodyParser());
  app.use(expressValidator());
  // Enable this once we have a service token
  //app.use(KeystoneMiddleware());
  app.listen(9000);

  router.post('/', function (req, res) {
    req.checkBody('IP', 'Invalid IP').isIP();
    req.checkBody('port', 'Invalid Port').isNumeric();
    req.checkBody('uuid', 'Invalid UUID').isUUID();
    req.checkBody('datastoreType', 'Invalid datastore').notEmpty();
    req.checkBody('password', 'Invalid password').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
      res.send(util.inspect(errors), 400);
    } else {
      retval = {uuid: uuid.v4()}
      new LoadBalancerFlow().createLoadBalancer(req.body.IP,
                                                req.body.port,
                                                req.body.uuid,
                                                req.body.datastoreType,
                                                retval.uuid,
                                                req.body.password,
                                                printError);
      res.send(retval, 200);
    }

  });

  router.put('/:uuid', function (req, res) {
    req.checkBody('IP', 'Invalid IP').isIP();
    req.checkBody('uuid', 'Invalid instance UUID').isUUID();
  var errors = req.validationErrors();
    if (errors) {
      res.send(util.inspect(errors), 400);
    } else {
      new LoadBalancerFlow().createSecondaryNode(req.params.uuid,
                                                req.body.uuid,
                                                req.body.IP,
                                                printError);
      res.send('', 200);
    }
  });
  router.delete('/:uuid', function (req, res) {
    new LoadBalancerFlow().deleteLoadBalancer(req.params.uuid, printError);
    res.send('', 200);
  });

  app.use('/', router);
};
