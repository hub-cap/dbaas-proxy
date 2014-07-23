var mysql = require('mysql');
var uuid = require('uuid');
var conf = require('./conf').conf;
var MYSQL_CRED = conf.get('mysql');
var LOGGER = require('./log').LOG;

// should i share this amongst all MySQL()'s or per class
// Also need to test to see if i need a pool
function MySQL() {
}

MySQL.prototype.createConnection = function () {
  this.connection = mysql.createConnection({
    host: MYSQL_CRED.host,
    user: MYSQL_CRED.user,
    password: MYSQL_CRED.password,
    database: MYSQL_CRED.database
  });
};

MySQL.prototype.connect = function () {
  var self = this;
  LOGGER.debug('connecting to mysql');
  this.createConnection();
  this.connection.connect();
  this.connection.on('error', function (err) {
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
      self.connection.end();
      setTimeout(self.connect.bind(self), 10000);
    } else {
      LOGGER.error("This needs to be handled");
      LOGGER.error(err);
    }
  });
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
                                                     address,
                                                     callback) {
  var details = { load_balancer_id: loadBalancerID,
                  virtual_ip_id: virtualIPID,
                  address: address
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
                        childDetails);
  this.createLoadBalancerNode(instanceUUID,
                               vipUUID,
                               privateIP,
                               true,
                               null,
                               callback);
};

MySQL.prototype.createLoadBalancerNode = function (instanceUUID,
                                                   vipUUID,
                                                   privateIP,
                                                   primaryNode,
                                                   nodeID,
                                                   callback) {

  var details = { id: instanceUUID,
                  child_load_balancer_id: vipUUID,
                  private_ip: privateIP,
                  node_id: nodeID,
                  primary_node: primaryNode
                };

  this.connection.query('insert into load_balancer_nodes set ?',
                        details, callback);
};

MySQL.prototype.retrieveLoadBalancerNodes = function (ID, callback) {
  this.connection.query(
    'select * From load_balancer_nodes where child_load_balancer_id = ?',
    [ID], callback
  );
};

MySQL.prototype.updateChildLoadBalancer = function (ID, loadBalancerID, dns) {
  this.connection.query(
    'update child_load_balancers set load_balancer_id = ?, state = "active", dns_name = ?  where id = ?',
    [loadBalancerID, dns, ID]
  );
};

MySQL.prototype.setLoadBalancerNodeID = function(ID, vipUUID) {
  console.log(ID, vipUUID);
  this.connection.query(
    'update load_balancer_nodes set node_id = ? where child_load_balancer_id = ?',
    [ID, vipUUID]
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

MySQL.prototype.updatePromotedNode = function (id, privateIP) {

  this.connection.query(
    'update load_balancer_nodes set primary_node = CASE WHEN ' +
      'private_ip = ? THEN 1 ELSE 0 END where child_load_balancer_id = ?',
    [privateIP, id]
  );
};

MySQL.prototype.retrieveLoadBalancerDetails = function (id, callback) {
  this.connection.query(
    'select * from parent_load_balancers p, child_load_balancers b ' +
      'where p.load_balancer_id = b.parent_load_balancer_id and b.id = ?',
    [id],
    callback
  );
};

exports.MySQL = MySQL;
