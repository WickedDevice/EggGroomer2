var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var Promise = require("bluebird");

var serialPort = Promise.promisifyAll(require("serialport"));

/* GET home page. */
router.get('/', function(req, res) {
    Promise.try(function(){
        return serialPort.listAsync();
    }).filter(function(port){
        console.log(port.comName);
        console.log(port.pnpId);
        console.log(port.manufacturer);
    }).then(function(){
        res.send("OK");
    }).catch(function(err){
      res.send("Error");
    });
});

module.exports = router;
