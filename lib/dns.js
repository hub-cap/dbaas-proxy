var pkgcloud = require('pkgcloud');

var conf = require('./conf').conf;

var DNS = conf.get('dns');

function createPkgCloudClient() {
  return pkgcloud.dns.createClient({
    provider: 'rackspace',
    apiKey: DNS.authkey,
    username: DNS.user,
    authUrl: DNS.endpoint
  });
}

// createPkgCloudClient().getZone(DNS.domainID,
//                                function (err, zone) {
//                                  console.log("err", err);
//                                  console.log("zone", zone);
//                                });
//

module.exports.createDNS = function (uuid, IP, callback) {
  createPkgCloudClient().createRecord(
    DNS.domainID,
    {name:uuid.replace(/-/gi,'') + '.' + DNS.domain,
     type:'A',
     tttl:3600,
     data: IP},
    callback)
};
