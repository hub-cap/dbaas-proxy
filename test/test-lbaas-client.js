var mocks = require('./mock-lbaas-client');
var state = { childLoadBalancer: { port:1,
                                   privateIP: '1.1.1.1',
                                   privatePort: 1234},
              parentLoadBalancer: { virtualIP: 99 }
            };


module.exports.testVerifyAndSaveParentLoadBalancer = function (test) {
  test.expect(2);
  var mock = new mocks.BasicLBMock.LBClient();

  mock._verifyAndSaveParentLoadBalancer(mocks.LB, function(err, parentLB) {
    test.deepEqual(parentLB.id, 'valid_lb');
    test.deepEqual(parentLB.virtualIP, 'valid_ip_id');
  });

  test.done();
};

module.exports.testProvisionChildLoadBalancer = function(test) {
  test.expect(3);
  var mock = new mocks.BasicLBMock.LBClient();
  mock._provisionChildLoadBalancer(state, function(err, data) {
    test.deepEqual(err, null);
  });
  test.deepEqual(state.remoteLoadBalancer.id, 'valid_lb');
  test.deepEqual(state.remoteLoadBalancer.virtualIps.length, 1);

  test.done();
};

module.exports.testFailureToProvisionChildLoadBalancer = function(test) {
  test.expect(1);
  var mock = new mocks.InvalidLBMock.LBClient();
  mock._provisionChildLoadBalancer(state, function(err, data) {
    //make sure error comes back because createLoadBalancer is failing
    test.notEqual(err, null);
  });

  test.done();
}

module.exports.testSaveChildLoadBalancer = function(test) {

  var mock = new mocks.BasicLBMock.LBClient();
  mock._saveChildLoadBalancer(state, function(err, data) {
    test.assertEqual(err, null);
    test.assertNotEqual(state.childLoadBalancer.insertId, null);
  });
  test.done();
}

module.exports.testDuplicatePortsLoadBalancer = function(test) {
  var mock = new mocks.DupPortLBMock.LBClient();
  mock._saveChildLoadBalancer(state, function(err, data) {
    test.assertEqual(err, null);
    test.assertNotEqual(state.childLoadBalancer.insertId, null);
  });
  test.done();
}
