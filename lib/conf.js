var nconf = require('nconf');
var fs = require('fs');
var path = '/etc/dbaasproxy';
var filename = 'config.dbaas-proxy';
// process argv then env
nconf.argv().env();
var argconf = nconf.get('config_file');

if (argconf) {
  nconf.file('argfile', {file:argconf});
}
nconf.file('global', {file: path + "/" + filename});
nconf.file('local', {file: './' + filename});

exports.conf = nconf;
