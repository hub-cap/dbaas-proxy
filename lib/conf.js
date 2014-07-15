var nconf = require('nconf');
var fs = require('fs');
var path = '/etc/dbaas-proxy';
var filename = 'config.json';
// process argv then env
nconf.argv().env();
var argconf = nconf.get('config_file');

if (argconf) {
  nconf.file('argfile', {file:argconf});
}
nconf.file('global', {file: path + "/" + filename});
nconf.file('local', {file: './' + filename});

exports.conf = nconf;
