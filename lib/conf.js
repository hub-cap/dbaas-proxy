var nconf = require('nconf');
var fs = require('fs');
var path = '/etc/dbaas-proxy';
var filename = 'config.json';
// process argv then env
nconf.argv().env();

nconf.file('global', {file: path + "/" + filename});
nconf.file('local', {file: './' + filename});

exports.conf = nconf;
