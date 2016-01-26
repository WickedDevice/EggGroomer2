var expressPromiseRouter = require("express-promise-router");
var router = expressPromiseRouter();
var Promise = require("bluebird");
var virtualeggs = require('../virtualeggs');

/* GET home page. */
router.get('/', function(req, res){

    return virtualeggs.initialize({
        keepInConfigMode: true,
        initInConfigMode: true}).then(function(){
        res.send("OK");
    }).catch(function(err){
        res.send("Error");
    });
});

module.exports = router;
