var mysql = require('mysql');
var uuid = require('uuid');
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
      "(select count(*) from child_load_balancers c " +
      "where p.load_balancer_id = c.parent_load_balancer_id " +
      "and c.load_balancer_id is not null and " +
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

MySQL.prototype.createChildLoadBalancer = function (vipUUID,
                                                    parentLoadBalancerID,
                                                    port,
                                                    instanceUUID,
                                                    datastoreType,
                                                    privateIP,
                                                    privatePort,
                                                    callback) {

  var childDetails = { id: vipUUID,
                        parent_load_balancer_id: parentLoadBalancerID,
                        port: port,
                        private_port: privatePort,
                        datastore_type: datastoreType,
                        state: 'provisioning'
                      };


  this.connection.query('insert into child_load_balancers set ?',
                        childDetails,
                        this.      createLoadBalancerNode.bind(this,
                                                          instanceUUID,
                                                          vipUUID,
                                                          privateIP,
                                                          true,
                                                          callback));
};

MySQL.prototype.createLoadBalancerNode = function (instanceUUID,
                                                   vipUUID,
                                                   privateIP,
                                                   primaryNode,
                                                   callback,
                                                   err,
                                                   results) {
  var details = { id: instanceUUID,
                  child_load_balancer_id: vipUUID,
                  private_ip: privateIP,
                  primary_node: primaryNode
                };
  if (err) {
    callback(err);
    return;
  }
  this.connection.query('insert into load_balancer_nodes set ?',
                        details, callback);
};

MySQL.prototype.updateChildLoadBalancer = function (ID, loadBalancerID) {
  this.connection.query(
    'update child_load_balancers set load_balancer_id = ?, state = "active" where id = ?',
    [loadBalancerID, ID]
  );
};

MySQL.prototype.retrieveChildLoadBalancer = function (vipUUID, callback) {
  this.connection.query(
    'select * from child_load_balancers where id = ?',
    [vipUUID],
    callback
  );
};

MySQL.prototype.retrieveChildLoadBalancer = function(id, callback) {
  this.connection.query(
    'select * from child_load_balancers where id = ?',
    [id],
    callback
    );
};

MySQL.prototype.deleteChildLoadBalancer = function (id) {
  this.connection.query(
    'update child_load_balancers set state = "deleted" where id = ?',
    id
  );
};

exports.MySQL = MySQL;
