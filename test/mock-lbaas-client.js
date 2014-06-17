var proxyquire = require('proxyquire');
var mysqlStub = {};
var lbaasStub = {};

var LB = {
  id: 'valid_lb',
  virtualIps: [{
    ipVersion: 'IPV4',
    id: 'valid_ip_id'
  }]
};

function MockMySQL() {
}

MockMySQL.prototype.connect = function() {
}
MockMySQL.prototype.createActiveLoadBalancer = function (lbid, virtualip) {
  this.lbid = lbid;
  this.virtualip = virtualip;
}

mysqlStub.MySQL = MockMySQL

function MockLB(){}

MockLB.prototype.createLoadBalancer = function(data, callback) {
  callback(null, LB);
};

function InvalidLB(){}
InvalidLB.prototype.createLoadBalancer = function(data, callback) {
  // throw any ole error msg
  callback("invalid");
};

module.exports.LB = LB;

module.exports.BasicLBMock = proxyquire(
  '../lib/lbaas-client',
  { './mysql': mysqlStub,
    'pkgcloud':{
      loadbalancer: {
        createClient: function(data) {
          return new MockLB();
        }
      }
    }
  });

module.exports.InvalidLBMock = proxyquire(
  '../lib/lbaas-client',
  { './mysql': mysqlStub,
    'pkgcloud':{
      loadbalancer: {
        createClient: function(data) {
          return new InvalidLB();
        }
      }
    }
  });
