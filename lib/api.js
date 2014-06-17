var express = require('express');
var bodyParser = require('body-parser');
var http = require('./http');
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

function createExpressServer() {
  app.use(bodyParser());
  // Enable this once we have a service token
  //app.use(http.KeystoneMiddleware());
  app.listen(9000);

  router.post('/', function (req, res) {
    lbaas.createLoadBalancerWithNode("10.176.168.145", 3306,
                                     "some-uuid", "mysql5.5",
                                     printError
                                    );

    res.send("posted sir\n");
  });

  app.use('/', router);
}

createExpressServer();
