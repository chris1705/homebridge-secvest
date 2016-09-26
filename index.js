var https = require('https')
_ = require('underscore');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform("homebridge-secvest", "Secvest", Secvest);
}

const states = {
  "unset": 3,
  "set": 1,
  "partset": 2
}

const modes = {
  "3": "unset",
  "1": "set",
  "2": "partset",
  "0": "partset"
}

class Secvest {

  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.host = config["host"];
    this.username = config["username"];
    this.password = config["password"];
    this.port = config["port"] || 4433
    this.lastUpdate = null;
    this.cachedPartitions = [];
  }

  getPartition(id, callback) {
    this.getPartitions((partitions) => {
      let partition = _.findWhere(partitions, {
        "id": id
      });
      callback(partition);
    });
  }

  getPartitions(callback) {
    if (this.lastUpdate === null ||  this.lastUpdate + 5000 < new Date().getTime()) {
      this.lastUpdate = new Date().getTime();
      let self = this;
      let options = {
        "method": "GET",
        "port": self.port,
        "hostname": self.host,
        "path": "/system/partitions/",
        "auth": self.username + ":" + self.password,
        "rejectUnauthorized": false,
        "requestCert": true,
        "agent": false
      }
      https.get(options, (res) => {
        res.on('data', (data) => {
          var partitions = JSON.parse(data);
          this.cachedPartitions = partitions;
          callback(partitions);
        });
      });
    } else {
      callback(this.cachedPartitions);
    }
  }

  accessories(callback) {
    let self = this;
    let partitions = self.getPartitions((partitions) => {
      let accessories = _.map(partitions, (partition) => {
        return new SecvestPartitionAccessory(partition.id,
          partition.name, self.config, self, self.log);
      });
      callback(accessories);
    });
  }
}

class SecvestPartitionAccessory {

  constructor(id, name, config, secvest, log) {
    this.id = id;
    this.name = name;
    this.host = config["host"];
    this.username = config["username"];
    this.password = config["password"];
    this.port = config["port"] || 4433;
    this.secvest = secvest;
    this.log = log;
    this.currentStateCharacteristic = null;
  }

  getCurrentState(callback) {
    let self = this;
    self.secvest.getPartition(self.id, (partition) => {
      callback(null, states[partition.state]);
    });
  }

  setCurrentState(state, callback) {
    let self = this;

    let data = JSON.stringify({
      "state": modes[state.toString()]
    });

    let options = {
      "method": "PUT",
      "port": self.port,
      "hostname": self.host,
      "path": "/system/partitions-" + self.id + "/",
      "auth": self.username + ":" + self.password,
      "rejectUnauthorized": false,
      "requestCert": true,
      "agent": false,
      "headers": {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Length': data.length
      }
    }
    let request = https.request(options, (res) => {
      res.on('data', (data) => {
        let partition = JSON.parse(data);
        switch (partition.state) {
          case "unset":
            self.currentStateCharacteristic.setValue(state);
            callback(null, Characteristic.SecuritySystemCurrentState.DISARMED);
            break;
          case "partset":
            self.currentStateCharacteristic.setValue(state);
            callback(null, Characteristic.SecuritySystemCurrentState.STAY_ARM);
            break;
          case "set":
            self.currentStateCharacteristic.setValue(state);
            callback(null, Characteristic.SecuritySystemCurrentState.AWAY_ARM);
            break;
        }
      });
    });

    // If request fails
    request.on("error", (e) => {
      if (e.code !== 'ECONNRESET') {
        return;
      }
      self.log("Request failed! Reason: '" + e +
        "'. Will try again in a second...'");
      setTimeout(() => {
        self.log("Retrying setting state of partition " + self.id);
        self.setCurrentState(state, callback);
      }, 1000);
    });
    request.write(data);
    request.end();
  }

  getServices() {
    let self = this;
    var securityService = new Service.SecuritySystem(this.name);
    this.currentStateCharacteristic = securityService
      .getCharacteristic(Characteristic.SecuritySystemCurrentState)
      .on('get', self.getCurrentState.bind(self));

    securityService
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .on('get', self.getCurrentState.bind(self))
      .on('set', self.setCurrentState.bind(self));

    this.getCurrentState((param, value) => {
      self.currentStateCharacteristic.setValue(value);
    });
    return [securityService];
  }
}
