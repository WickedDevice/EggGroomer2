var Promise = require("bluebird");
var serialPort = Promise.promisifyAll(require("serialport"));
Promise.promisifyAll(serialPort.SerialPort.prototype);
var SerialPort = serialPort.SerialPort;
var EventEmitter = require('events');

module.exports = (function(){

    var myEventEmitter = new EventEmitter.EventEmitter();

    var stateByPort = {};
    var initializationInProgress = false;

    // initialize has the job of going through the listed serial ports
    // and picking out the FTDI ports, then attaching data handlers
    // to those, and setting up periodic keep alive functions to keep them
    // in config mode if options contains 'keepInConfigMode: true'
    var initialize = function(options){
        if(initializationInProgress){
            return false;
        }

        initializationInProgress = true;

        // clean up any existing state
        var comNames = getComNames();
        var options = options;
        var promiseToClose = Promise.try(function(){});
        for(var ii = 0; ii < comNames.length; ii++){
            var comName = comNames[ii];
            if(stateByPort[comName].keepInConfigMode){
                clearInterval(stateByPort[comName].keepInConfigMode);
            }
            try{
                if(stateByPort[comName].sp.isOpen()){
                    promiseToClose = promiseToClose.then(function(){
                        return stateByPort[comName].sp.closeAsync().then(function(){
                            console.log(comName + " Closed.");
                        });//.delay(5000);
                    });
                }
            }
            catch(exception){
                console.log("Close Before Opening Exception: " + exception);
            }
        }

        return promiseToClose.then(function(){
            stateByPort = {};
        }).then(function(){
            return serialPort.listAsync();
        }).filter(function(port){ // we only care about FTDI ports
            return port.manufacturer == "FTDI";
        }).each(function(port) { // for each port that is an FTDI port
            console.log(port);
            try{
                var comName = port.comName;
                stateByPort[comName] = {};

                var sp = new SerialPort(comName, {
                    baudrate: 115200,
                    parser: serialPort.parsers.readline("\n"),
                    rtscts: true
                }); //, false); // do  not open immediately

                sp.on("data", function(data){
                    console.log(comName + ": " + data);
                    handleIncomingData(comName, data);
                });

                sp.on("open", function (error){
                    if(error){
                        console.log("Open Error: " + error);
                    }
                    else{
                        if(options.keepInConfigMode){
                            var keepInConfigMode = setInterval(function(){
                                try {
                                    if (sp.isOpen()) {
                                        sp.write("\r");
                                    }
                                    else{
                                        clearInterval(keepInConfigMode);
                                    }
                                }
                                catch(exception){
                                    console.log('Keep Alive Excption: ' + exception);
                                }
                            }, 1000); // every half second send a carriage return to keep it in config mode
                            stateByPort[comName].keepInConfigMode = keepInConfigMode;
                        }

                        if(options.initInConfigMode){
                            myEventEmitter.once(comName + '/' + "Enter 'aqe' for CONFIG mode.", function(){
                                try {
                                    if (sp.isOpen()) {
                                        sp.write("aqe\r"); // put it into config mode
                                    }
                                }
                                catch(exception){
                                    console.log("Init In Config Mode Exception: " + exception);
                                }
                            });
                        }

                        // reset the Arduino using the RTS/DTR lines
                        sp.set({rts:false, dtr:false}, function(){
                            setTimeout(function(){
                                sp.set({rts:true, dtr:true}, function(){
                                    console.log(comName + " auto reset complete");
                                });
                            }, 100);
                        });
                    }
                });

                stateByPort[comName].sp = sp;
            }
            catch(exception) {
                console.log("Open Exception:" + exception);
            }
        }).then(function(){
            initializationInProgress = false;
            return getComNames();
        }).catch(function(error){
            console.log("Initialization Exception: " + error);
            initializationInProgress = false;
        });
    }

    // handle line containing "Sensor Suite"
    function handleSensorSuite(comName, data){
        var parts = data.split("Sensor Suite");
        if(parts.length > 1) {
            var sensorType = removeLeadingBarAndTrim(parts[0]);
            stateByPort[comName].sensorType = sensorType;
            return true;
        }
        return false;
    }

    function handleFirmwareVersion(comName, data){
        var parts = data.split("   Firmware Version ");
        if (parts.length > 1) {
            var firmwareVersion = stripTrailingBarAndTrim(parts[1]);
            stateByPort[comName].firmwareVersion = firmwareVersion;
            return true;
        }
        return false;
    }

    function handleEnterAqe(comName, data){
        if(data == "Enter 'aqe' for CONFIG mode."){
            return true;
        }
        return false;
    }

    function hanldeMacAddress(comName, data){
        
        return false;
    }

    function removePromptsFromDataLine(data){
        var dataWithoutPrompts = data;
        var aqePrompt = "AQE>: ";
        var locationOfFirstAqePrompt = dataWithoutPrompts.indexOf(aqePrompt);
        if(locationOfFirstAqePrompt >= 0){
            dataWithoutPrompts = dataWithoutPrompts.slice(locationOfFirstAqePrompt + aqePrompt.length);
        }
        // what if there's a trailing AQE for some reason as well? lets strip that off the tail just in case
        var locationOfFirstAqePrompt = dataWithoutPrompts.indexOf(aqePrompt);
        if(locationOfFirstAqePrompt >= 0){
            dataWithoutPrompts = dataWithoutPrompts.slice(0, locationOfFirstAqePrompt);
        }

        return dataWithoutPrompts.trim();
    }

    function handleIncomingData(comName, data){
        var data = removePromptsFromDataLine(data);
        var eventName = comName + '/' + data;

        if(handleSensorSuite(comName, data)){
            // nothing to do here
        }
        else if(handleFirmwareVersion(comName, data)){
            // nothing to do here
        }
        else if(handleEnterAqe(comName, data)){
            myEventEmitter.emit(eventName);
        }
        else if(hanldeMacAddress(comName, data)){

        }


    }

    function removeLeadingBarAndTrim(str){
        var tmp = str.trim();
        if(tmp[0] == '|' && tmp.length > 1){
            tmp = tmp.substring(1);
        }
        return tmp.trim();
    }

    function stripTrailingBarAndTrim(str){
        return str.substring(0, str.lastIndexOf("|")).trim();
    }

    function getPortFromComName(comName){
        if(stateByPort[comName]){
            return stateByPort[comName].sp;
        }
        else{
            return null;
        }
    }

    function getComNames(){
        return Object.keys(stateByPort);
    }

    function sendCommandsToPort(comName, commandList){
        var numCommands = (commandList && commandList.length) ? commandList.length : 0;
        for(var ii = 0; ii < numCommands; ii++) {
            // create an event listener for the *response* to this command
            var eventName = comName + '/' + commandList[ii];
            if (ii <= numCommands - 2) {
                myEventEmitter.once(eventName, function () {
                    var sp = getPortFromComName(comName);
                    if (sp && sp.isOpen()) {
                        try {
                            sp.write(commandList[ii + 1]);
                        }
                        catch (exception) {
                            console.log("Write Exception: " + exception);
                        }
                    }
                });
            }
            else {
                myEventEmitter.once(eventName, function () {
                    console.log(comName + ": All commands sent!");
                });
            }
        }

        // then fire off the first write
        if(numCommands > 0){
            sp.write(commandList[0]);
        }
    }

    var sendCommandsToAll = function(commandList){
        var comNames = getComNames();
        var numComNames = comNames.length;
        for(var ii = 0; ii < numComNames; ii++){
            sendCommandsToPort(comNames[ii], commandList);
        }
    };

    return {
        initialize: initialize,
        sendCommandsToPort: sendCommandsToPort,
        sendCommandsToAll: sendCommandsToAll
    }

})();