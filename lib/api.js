//var dnode = require('dnode');
var express = require('express');
var bodyParser = require('body-parser');
var http = require('./http');
var LBClient = require('./lbaas-client').LBClient;
//var LBAAS_PORT = 6000;

var lbaas = new LBClient()

function createExpressServer() {
  var app = express();
  app.use(bodyParser());
  // Enable this once we have a service token
  //app.use(http.KeystoneMiddleware());
  app.listen(9000);

  var router = express.Router();

  router.post('/', function(req, res) {
    lbaas.createLoadBalancerWithNode("10.176.168.145", 3306,
                              "some-uuid", "mysql5.5", function(err, lb) {
                                console.log("error was:" , err);
                                console.log("finished lb", lb);
                              });
    res.send("posted sir\n");
  });

  app.use('/', router);
}

// function createContainer() {
//
//   dnode.connect(LBAAS_PORT, function(remote){
//     remote.create("test-name", function (result) {
//       console.log(result);
//     });
//   });
// }

createExpressServer();
