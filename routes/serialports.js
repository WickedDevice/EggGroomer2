var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var Promise = require("bluebird");
var virtualeggs = require('../virtualeggs');

/* GET home page. */
router.get('/', function(req, res){

    return virtualeggs.initialize({
        keepInConfigMode: true,
        initInConfigMode: true}).then(function(ports){
        console.log(ports);
        res.send(ports);
    }).catch(function(err){
        res.send("Error");
    });
});

router.get('/testsend', function(req, res){
    virtualeggs.sendCommandsToAll(['restore defaults', 'get settings']);
    res.send("OK");
});

module.exports = router;
