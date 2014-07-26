var async = require('async');
var redis = require('redis');
var LOGGER = require('./log').LOG;

function RedisInstanceFlow() {}

RedisInstanceFlow.prototype.configureMaster = function(ip,
                                                       port,
                                                       password,
                                                       masterPassword,
                                                       callback){

  this.instance = {
    port: port,
    ip: ip,
    password: password,
    masterPassword: masterPassword
  };

  this.redisClient = redis.createClient(port, ip, {
    retry_max_delay: 60*1000,
    auth_pass: password
  });

  async.series([
    this._redisSetPassword.bind(this),
    this._redisSetMasterAuth.bind(this)
  ], this._completedFlow.bind(this, callback));
};

RedisInstanceFlow.prototype.configureSlave = function(ip,
                                                       port,
                                                       password,
                                                       masterPassword,
                                                       masterIP,
                                                       masterPort,
                                                       callback){

  this.instance = {
    port: port,
    ip: ip,
    password: password,
    masterPassword: masterPassword,
    masterIP: masterIP,
    masterPort: masterPort
  };

  this.redisClient = redis.createClient(port, ip, {
    retry_max_delay: 60*1000,
    auth_pass: password
  });

  async.series([
    this._redisSetPassword.bind(this),
    this._redisSetMasterAuth.bind(this),
    this._redisSlaveof.bind(this)
  ], this._completedFlow.bind(this, callback));
};


RedisInstanceFlow.prototype._completedFlow = function (callback,
                                                      err, results) {
  if (this.redisClient && this.redisClient.connected) {
    this.redisClient.end();
  }
  LOGGER.debug(this.state);
  callback(err, this.state);
};

RedisInstanceFlow.prototype._redisSetPassword = function (callback) {
  if (this.instance.masterPassword) {
    this.redisClient.send_command(
      'config',
      ['set', 'requirepass', this.instance.masterPassword],
      callback
    );
  }
};

RedisInstanceFlow.prototype._redisSetMasterAuth = function (callback) {
  if (this.instance.masterPassword) {
    this.redisClient.send_command(
      'config',
      ['set', 'masterauth', this.instance.Password],
      callback
    );
  }
};

RedisInstanceFlow.prototype._redisSlaveof = function (callback) {
  this.redisClient.send_command(
    'slaveof',
    ['set', 'password', this.instance.masterIP, this.instance.masterPort],
    callback
  );
};

module.exports.RedisInstanceFlow = RedisInstanceFlow;
