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

  this.redisClient.on('error', function(err) {
    console.log(err);
  });
  // Takes a second to get a connection
  setTimeout(this._masterFlow.bind(this), 2000, callback);
};

RedisInstanceFlow.prototype._masterFlow = function(callback) {
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

  this.redisClient.on('error', function (err) {
    console.log("error connecting " + err);
  });
  // Takes a few seconds to get the connection
  setTimeout(this._slaveFlow.bind(this), 2000, callback);

};

RedisInstanceFlow.prototype._slaveFlow = function (callback) {
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
  callback(err, this.state);
};

RedisInstanceFlow.prototype._redisSetPassword = function (callback) {
  if (this.instance.masterPassword
      && this.redisClient && this.redisClient.connected) {
    LOGGER.debug("setting password");
    this.redisClient.send_command(
      'config',
      ['set', 'requirepass', this.instance.masterPassword],
      callback
    );
  }
};

RedisInstanceFlow.prototype._redisSetMasterAuth = function (callback) {
  if (this.instance.masterPassword
      && this.redisClient && this.redisClient.connected) {
    LOGGER.debug("setting masterauth");
    this.redisClient.send_command(
      'config',
      ['set', 'masterauth', this.instance.Password],
      callback
    );
  }
};

RedisInstanceFlow.prototype._redisSlaveof = function (callback) {
  if (this.redisClient && this.redisClient.connected) {
    LOGGER.debug("setting slaveof");
    this.redisClient.send_command(
      'slaveof',
      [this.instance.masterIP, this.instance.masterPort],
      callback
    );
  }
};

module.exports.RedisInstanceFlow = RedisInstanceFlow;
