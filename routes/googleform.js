var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var Promise = require("bluebird");
var formdata = require('../eggformdata');

/* GET home page. */
router.get('/', function(req, res){
    return formdata.load().catch(function(err){
        console.log(err);
        res.send("Error");
    }).then(function(database){
        res.send(database);
    });
});

router.get('/testsend', function(req, res){
    virtualeggs.sendCommandsToAll(['restore defaults', 'get settings']);
    res.send("OK");
});

module.exports = router;
