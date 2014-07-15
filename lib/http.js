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
    //LOGGER.log(data);
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
                                                printError);
      res.send(retval, 200);
    }

  });

  router.get('/:uuid', function (req, res) {
    new LoadBalancerFlow().retrieveLoadBalancerDetails(
      req.params.uuid,
      function(err, items) {
        var item = items[0];
        // delete stuff the user doesnt need to see
        delete item['virtual_ip_id'];
        delete item['parent_load_balancer_id'];

        res.send(item, 200);
      });
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
