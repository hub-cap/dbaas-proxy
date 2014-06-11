//var dnode = require('dnode');
var express = require('express');
var bodyParser = require('body-parser')
var http = require('./http');
//var LBAAS_PORT = 6000;


function createExpressServer() {
  var app = express();
  app.use(bodyParser());
  // Enable this once we have a service token
  //app.use(http.KeystoneMiddleware());
  app.listen(9000);

  var router = express.Router();

  router.post('/', function(req, res) {
    console.log(req.body);
    res.send("Creating LB");
  });

  router.get('/', function(req, res) {
    console.log(req);
    res.send("Got it bub!");
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
