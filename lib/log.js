var winston = require('winston');
var conf = require('./conf').conf;
var LOG_VALUES = conf.get('logger');

var logger = new (winston.Logger)({
  exitOnError: false,
  transports: [
    new (winston.transports.Console)({level: 'debug'}),
    new (winston.transports.File)({filename: LOG_VALUES.logfile,
                                   level: 'debug'})
  ]
});

module.exports.LOG = logger;
