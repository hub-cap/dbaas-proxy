var mysql = require('mysql');
var conf = require('./conf').conf;
var MYSQL_CRED = conf.get('mysql');

// should i share this amongst all MySQL()'s or per class
// Also need to test to see if i need a pool
var connection = mysql.createConnection({
  host: MYSQL_CRED['host'],
  user: MYSQL_CRED['user'],
  password: MYSQL_CRED['password'],
  database: MYSQL_CRED['database'],
});

connection.connect();

function MySQL() {
}

MySQL.prototype.retrieveActiveLoadBalancers = function(results_callback) {
  query_results = null;
  connection.query(
    "select * from parent_load_balancers where active = true",
    results_callback);
}

MySQL.prototype.createActiveLoadBalancer = function(loadBalancerID,
                                                  virtualIPID) {
  var details = {load_balancer_id: loadBalancerID,
                 virtual_ip_id: virtualIPID,
                 active: true}
  // Should i use a callback here?
  connection.query('insert into parent_load_balancers set ?', details);
}

MySQL.prototype.createChildLoadBalancer = function(parentLoadBalancerID,
                                                   port,
                                                   instanceUUID,
                                                   datastoreType,
                                                   privateIP,
                                                   callback) {
  var details = {parent_load_balancer_id: parentLoadBalancerID,
                 port: port,
                 instance_uuid: instanceUUID,
                 datastore_type: datastoreType,
                 private_ip: privateIP}
  connection.query('insert into load_balancer_nodes set ?', details, callback);
}

MySQL.prototype.updateChildLoadBalancer = function(ID, loadBalancerID) {
  connection.query(
    'update load_balancer_nodes set load_balancer_id = ? where id = ?',
    [loadBalancerID, ID]);
}

exports.MySQL = MySQL
