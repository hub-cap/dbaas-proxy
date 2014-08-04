var express = require('express');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var util = require('util');
var uuid = require('uuid');

var conf = require('./conf').conf;
var LoadBalancerFlow = require('./lbaas-client').LoadBalancerFlow;

var LOGGER = require('./log').LOG;
var app = express();
var router = express.Router();

var printError = function (err, data) {
  if (err) {
    LOGGER.error(err);
  } else {
    LOGGER.log("completed operation on", data.childLoadBalancer);
  }
};

module.exports.createExpressServer = function () {

  app.use(bodyParser());
  app.use(expressValidator());
  app.listen(conf.get('listenPort'));

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
      var retval = {uuid: uuid.v4()};
      new LoadBalancerFlow().createLoadBalancer(req.body.IP,
                                                req.body.port,
                                                req.body.uuid,
                                                req.body.datastoreType,
                                                retval.uuid,
                                                req.body.password,
                                                req.body.masterPassword,
                                                printError);
      // TODO: The client won't know about any errors since we don't wait
      res.send(retval, 200);
    }

  });

  router.get('/:uuid', function (req, res) {
    new LoadBalancerFlow().retrieveLoadBalancerDetails(
      req.params.uuid,
      function(err, state) {

        var retval = {};
        retval.address = state.childLoadBalancer.address;
        retval.port = state.childLoadBalancer.port;
        retval.loadBalancerID = state.childLoadBalancer.loadBalancerID;
        retval.dnsName = state.childLoadBalancer.dnsName;
        retval.status = state.childLoadBalancer.status;
        if (!retval.status) {
          // THE LB hasnt actually started provisioning yet
          retval.status = 'BUILD';
        }
        if (retval.status === 'ACTIVE' && retval.dnsName === null) {
          // Since we are using the state of lbaas, we must also wait
          // for dns to finish before changing the actual status.
          retval.status = 'BUILD';
        }
        res.send(retval, 200);

      });
  });

  router.put('/:uuid', function (req, res) {
    req.checkBody('IP', 'Invalid IP').isIP();
    req.checkBody('uuid', 'Invalid instance UUID').isUUID();
    req.checkBody('password', 'Invalid password').notEmpty();
    req.checkBody('masterPassword', 'Invalid password').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
      res.send(util.inspect(errors), 400);
    } else {
      new LoadBalancerFlow().createSecondaryNode(req.params.uuid,
                                                req.body.uuid,
                                                req.body.IP,
                                                req.body.password,
                                                req.body.masterPassword,
                                                printError);
      res.send('', 200);
    }
  });

  router.delete('/:uuid', function (req, res) {
    new LoadBalancerFlow().deleteLoadBalancer(req.params.uuid, printError);
    res.send('', 200);
  });


  router.patch('/:uuid/accessList', function (req, res) {
    req.checkBody('address', 'Invalid IP').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
      res.send(util.inspect(errors), 400);
    } else {
      new LoadBalancerFlow().addAccessRule(req.params.uuid, req.body.address,
                                           printError);
      res.send('', 200);
    }
  });
  router.delete('/:uuid/accessList/:accessListID', function (req, res) {
    new LoadBalancerFlow().deleteAccessRule(req.params.uuid,
                                            req.params.accessListID,
                                            printError);
    res.send('', 200);
  });
  router.get('/:uuid/accessList', function (req, res) {
    new LoadBalancerFlow().getAccessRules(
      req.params.uuid,
      function (err, items) {
        if (items[0] === undefined) {
          // I think there is a bug in the response for pkgCloud and
          // its returning [undefined, [{accessList}]
          res.send(items[1], 200);
        } else {
          res.send(items, 200);
        }
      }
    );
  });

  app.use('/', router);
};
