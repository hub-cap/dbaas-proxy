var mysql = require('mysql');
var conf = require('./conf').conf;
var MYSQL_CRED = conf.get('mysql');

// should i share this amongst all MySQL()'s or per class
// Also need to test to see if i need a pool
function MySQL() {
  this.connection = mysql.createConnection({
    host: MYSQL_CRED.host,
    user: MYSQL_CRED.user,
    password: MYSQL_CRED.password,
    database: MYSQL_CRED.database
  });
}

MySQL.prototype.connect = function () {
  this.connection.connect();
};

MySQL.prototype.retrieveActiveLoadBalancers = function (activeThreshold,
                                                        results_callback) {
  this.connection.query(
    "select * from parent_load_balancers p where ? > " +
      "(select count(*) from load_balancer_nodes n " +
      "where p.load_balancer_id = n.parent_load_balancer_id " +
      "and n.load_balancer_id is not null and " +
      "state = 'active')",
    [activeThreshold],
    results_callback
  );
};

MySQL.prototype.createActiveLoadBalancer = function (loadBalancerID,
                                                     virtualIPID,
                                                     callback) {
  var details = { load_balancer_id: loadBalancerID,
                  virtual_ip_id: virtualIPID
                };
  // Should i use a callback here?
  this.connection.query('insert into parent_load_balancers set ?',
                        details, callback);
};

MySQL.prototype.createChildLoadBalancer = function (parentLoadBalancerID,
                                                   port,
                                                   instanceUUID,
                                                   datastoreType,
                                                   privateIP,
                                                   callback) {
  var details = { parent_load_balancer_id: parentLoadBalancerID,
                  port: port,
                  instance_uuid: instanceUUID,
                  datastore_type: datastoreType,
                  private_ip: privateIP,
                  state: 'provisioning'
                };
  this.connection.query('insert into load_balancer_nodes set ?',
                        details, callback);
};

MySQL.prototype.updateChildLoadBalancer = function (ID, loadBalancerID) {
  this.connection.query(
    'update load_balancer_nodes set load_balancer_id = ?, state = "active" where id = ?',
    [loadBalancerID, ID]
  );
};

MySQL.prototype.retrieveLoadBalancerNode = function (instanceUUID, callback) {
  this.connection.query(
    'select * from load_balancer_nodes where instance_uuid = ?',
    [instanceUUID],
    callback
  );
};

MySQL.prototype.deleteLoadBalancerNode = function (id) {
  this.connection.query(
    'update load_balancer_nodes set state = "deleted" where id = ?',
    id
  );
};

exports.MySQL = MySQL;
