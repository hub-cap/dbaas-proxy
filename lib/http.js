KeystoneClient = require('keystone-client').KeystoneClient



exports.KeystoneMiddleware = function() {
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
