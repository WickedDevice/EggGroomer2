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
                                        stateByPort[comName].sentAqeCommand = true;
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

    function handleField(comName, data, fieldString, objFieldName){
        var locationOfFieldString = data.indexOf(fieldString);
        if(locationOfFieldString >= 0){
            data = data.slice(locationOfFieldString + fieldString.length).trim();
            stateByPort[comName][objFieldName] = {
                value: data
            };
            return true;
        }
        return false;
    }

    function handleStatusField(comName, data, fieldString, objStatusFieldName){
        // ensure the status field exists
        if(!stateByPort[comName].status){
            stateByPort[comName].status = {};
        }

        var locationOfFieldString = data.indexOf(fieldString);
        if(locationOfFieldString >= 0){
            data = data.slice(locationOfFieldString + fieldString.length).trim();
            var isOk = (data.indexOf("OK") >= 0);
            stateByPort[comName].status[objStatusFieldName] = {
                value: isOk
            };
            return true;
        }
        return false;

    }

    function handleFieldWithBackup(comName, data, fieldString, objFieldName, hasValue){
        if(hasValue === undefined){
            hasValue = true;
        }

        var locationOfFieldString = data.indexOf(fieldString);
        var backedUp = (data.indexOf("*") < 0);
        if(locationOfFieldString >= 0){
            data = data.slice(locationOfFieldString + fieldString.length).trim();

            var obj = { backedUp: backedUp };
            if(hasValue){
                obj.value = data;
            }
            stateByPort[comName][objFieldName] = obj;
            return true;
        }
        return false;
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
        return handleField(comName, data, "Firmware Version ", "firmwareVersion");
    }

    function handleEggSerialNumber(comName, data){
        return handleField(comName, data, "Egg Serial Number: ", "eggSerialNumber");
    }

    function handleEnterAqe(comName, data){
        if(data == "Enter 'aqe' for CONFIG mode."){
            return true;
        }
        return false;
    }

    function handleMacAddress(comName, data){
        return handleFieldWithBackup(comName, data, "MAC Address: ", "macAddress");
    }

    function handleOperationalMode(comName, data){
        return handleField(comName, data, "Operational Mode: ", "operationalMode");
    }

    function handleTemperatureUnits(comName, data){
        return handleField(comName, data, "Temperature Units: ", "temperatureUnits");
    }

    function handleAltitude(comName, data){
        return handleField(comName, data, "Altitude: ", "altitude");
    }

    function handleBacklightSettings(comName, data){
        return handleField(comName, data, "Backlight Settings: ", "backlightSettings");
    }

    function handleSamplingInterval(comName, data){
        return handleField(comName, data, "Sensor Sampling Interval: ", "sensorSamplingInterval");
    }

    function handleAveragingInterval(comName, data){
        return handleField(comName, data, "Sensor Averaging Interval: ", "sensorAveragingInterval");
    }

    function handleReportingInterval(comName, data){
        return handleField(comName, data, "Sensor Reporting Interval: ", "sensorReportingInterval");
    }

    function handleSpiFlashStatus(comName, data){
        return handleStatusField(comName, data, "SPI Flash Initialization...", "spiFlash");
    }

    function handleSdCardStatus(comName, data){
        return handleStatusField(comName, data, "SD Card Initialization...", "sdCard");
    }

    function handleCurrentFirmwareSignature(comName, data){
        return handleField(comName, data, "Current firmware signature: ", "firmwareSignature");
    }

    function handleSht25Status(comName, data){
        return handleStatusField(comName, data, "SHT25 Initialization...", "sht25");
    }

    function handleNo2AfeStatus(comName, data){
        return handleStatusField(comName, data, "NO2 Sensor AFE Initialization...", "no2Afe");
    }

    function handleCoAfeStatus(comName, data){
        return handleStatusField(comName, data, "CO Sensor AFE Initialization...", "coAfe");
    }

    function handleNo2AdcStatus(comName, data){
        return handleStatusField(comName, data, "NO2 Sensor ADC Initialization...", "no2Adc");
    }

    function handleCoAdcStatus(comName, data){
        return handleStatusField(comName, data, "CO Sensor ADC Initialization...", "coAdc");
    }

    function handleSo2AfeStatus(comName, data){
        return handleStatusField(comName, data, "SO2 Sensor AFE Initialization...", "so2Afe");
    }

    function handleO3AfeStatus(comName, data){
        return handleStatusField(comName, data, "O3 Sensor AFE Initialization...", "o3Afe");
    }

    function handleSo2AdcStatus(comName, data){
        return handleStatusField(comName, data, "SO2 Sensor ADC Initialization...", "so2Adc");
    }

    function handleO3AdcStatus(comName, data){
        return handleStatusField(comName, data, "O3 Sensor ADC Initialization...", "o3Adc");
    }

    function handleRtcStatus(comName, data) {
        return handleStatusField(comName, data, "RTC Initialization...", "rtc");
    }

    function handleCc3000Status(comName, data){
        return handleStatusField(comName, data, "CC3000 Initialization...", "wifi");
    }

    function handleEsp8266Status(comName, data){
        return handleStatusField(comName, data, "ESP8266 Initialization...", "wifi");
    }

    function handleNetworkMethod(comName, data){
        return handleField(comName, data, "Method: ", "networkMethod");
    }

    function handleSsid(comName, data){
        return handleField(comName, data, "SSID: ", "ssid");
    }

    function handleSecurityMode(comName, data){
        return handleField(comName, data, "Security Mode: ", "securityMode");
    }

    function handleIpMode(comName, data){
        return handleField(comName, data, "IP Mode: ", "ipMode");
    }

    function handleUpdateServer(comName, data){
        return handleField(comName, data, "Update Server: ", "updateServer");
    }

    function handleUpdateFilename(comName, data){
        return handleField(comName, data, "Update Flename: ", "updateFilename");
    }

    function handleNtpServer(comName, data){
        return handleField(comName, data, "NTP Server: ", "ntpServer");
    }

    function handleNtpTimezoneOffset(comName, data){
        return handleFieldWithBackup(comName, data, "NTP TZ Offset: ", "ntpTimezoneOffset");
    }

    function handleMqttServer(comName, data){
        return handleField(comName, data, "MQTT Server: ", "mqttServer");
    }

    function handleMqttPort(comName, data){
        return handleField(comName, data, "MQTT Port: ", "mqttPort");
    }

    function handleMqttClientId(comName, data){
        return handleField(comName, data, "MQTT Client ID: ", "mqttClientId");
    }

    function handleMqttAuthentication(comName, data){
        return handleField(comName, data, "MQTT Authentication: ", "mqttAuthentication");
    }

    function handleMqttUsername(comName, data){
        return handleField(comName, data, "MQTT Username: ", "mqttUsername");
    }

    function handleMqttTopicPrefix(comName, data){
        return handleField(comName, data, "MQTT Topic Prefix: ", "mqttTopicPrefix");
    }

    function handleMqttPassword(comName, data){
        return handleFieldWithBackup(comName, data, "MQTT Password", "mqttPassword", false); // no value field
    }

    function handlePrivateKey(comName, data){
        return handleFieldWithBackup(comName, data, "Private key", "privateKey", false); // no value field
    }

    function handleNo2Sensitivity(comName, data){
        return handleFieldWithBackup(comName, data, "NO2 Sensitivity [nA/ppm]: ", "no2Sensitivity");
    }

    function handleNo2Slope(comName, data){
        return handleFieldWithBackup(comName, data, "NO2 Slope [ppb/V]: ", "no2Slope");
    }

    function handleNo2Offset(comName, data){
        return handleFieldWithBackup(comName, data, "NO2 Offset [V]: ", "no2Offset");
    }

    function handleCoSensitivity(comName, data){
        return handleFieldWithBackup(comName, data, "CO Sensitivity [nA/ppm]: ", "coSensitivity");
    }

    function handleCoSlope(comName, data){
        return handleFieldWithBackup(comName, data, "CO Slope [ppm/V]: ", "coSlope");
    }

    function handleCoOffset(comName, data){
        return handleFieldWithBackup(comName, data, "CO Offset [V]: ", "coOffset");
    }

    function handleSo2Sensitivity(comName, data){
        return handleFieldWithBackup(comName, data, "SO2 Sensitivity [nA/ppm]: ", "so2Sensitivity");
    }

    function handleSo2Slope(comName, data){
        return handleFieldWithBackup(comName, data, "SO2 Slope [ppb/V]: ", "so2Slope");
    }

    function handleSo2Offset(comName, data){
        return handleFieldWithBackup(comName, data, "SO2 Offset [V]: ", "so2Offset");
    }

    function handleO3Sensitivity(comName, data){
        return handleFieldWithBackup(comName, data, "O3 Sensitivity [nA/ppm]: ", "o3Sensitivity");
    }

    function handleO3Slope(comName, data){
        return handleFieldWithBackup(comName, data, "O3 Slope [ppb/V]: ", "o3Slope");
    }

    function handleO3Offset(comName, data){
        return handleFieldWithBackup(comName, data, "O3 Offset [V]: ", "o3Offset");
    }

    function handlePmOffset(comName, data){
        return handleFieldWithBackup(comName, data, "PM Offset [V]: ", "pmOffset");
    }

    function handleTemperatureOffsetDegC(comName, data){
        return handleFieldWithBackup(comName, data, "Temperature Reporting Offset [degC]: ", "temperatureOffset");
    }

    function handleTemperatureOffsetDegF(comName, data){
        return handleFieldWithBackup(comName, data, "Temperature Reporting Offset [degF]: ", "temperatureOffset");
    }

    function handleHumidityOffset(comName, data){
        return handleFieldWithBackup(comName, data, "Humidity Reporting Offset [%]: ", "humidityOffset");
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

        // there are a many handlers that do not need to emit events
        // i.e. all those handlers that run during startup / config dump
        if(data == ""){} // this is the most likely occurrence because of keep alive
        else if(handleSensorSuite(comName, data)){}
        else if(handleEggSerialNumber(comName, data)){}
        else if(handleFirmwareVersion(comName, data)){}
        else if(handleEnterAqe(comName, data)){
            // emit an event so that 'aqe' gets sent
            myEventEmitter.emit(eventName);
        }
        else if(handleSpiFlashStatus(comName, data)){}
        else if(handleSdCardStatus(comName, data)){}
        else if(handleCurrentFirmwareSignature(comName, data)){}
        else if(handleSht25Status(comName, data)){}
        else if(handleNo2AfeStatus(comName, data)){}
        else if(handleNo2AdcStatus(comName, data)){}
        else if(handleCoAfeStatus(comName, data)){}
        else if(handleCoAdcStatus(comName, data)){}
        else if(handleSo2AfeStatus(comName, data)){}
        else if(handleSo2AdcStatus(comName, data)){}
        else if(handleO3AfeStatus(comName, data)){}
        else if(handleO3AdcStatus(comName, data)){}
        else if(handleRtcStatus(comName, data)){}
        else if(handleCc3000Status(comName, data)){}
        else if(handleEsp8266Status(comName, data)){}
        else if(handleOperationalMode(comName, data)){}
        else if(handleTemperatureUnits(comName, data)){}
        else if(handleAltitude(comName, data)){}
        else if(handleBacklightSettings(comName, data)){}
        else if(handleSamplingInterval(comName, data)){}
        else if(handleAveragingInterval(comName, data)){}
        else if(handleReportingInterval(comName, data)){}
        else if(handleMacAddress(comName, data)){}
        else if(handleNetworkMethod(comName, data)){}
        else if(handleSsid(comName, data)){}
        else if(handleSecurityMode(comName, data)){}
        else if(handleIpMode(comName, data)){}
        else if(handleUpdateServer(comName, data)){}
        else if(handleUpdateFilename(comName, data)){}
        else if(handleUpdateFilename(comName, data)){}
        else if(handleNtpServer(comName, data)){}
        else if(handleNtpTimezoneOffset(comName, data)){}
        else if(handleMqttServer(comName, data)){}
        else if(handleMqttPort(comName, data)){}
        else if(handleMqttClientId(comName, data)){}
        else if(handleMqttAuthentication(comName, data)){}
        else if(handleMqttUsername(comName, data)){}
        else if(handleMqttTopicPrefix(comName, data)){}
        else if(handleMqttPassword(comName, data)){}
        else if(handlePrivateKey(comName, data)){}
        else if(handleNo2Sensitivity(comName, data)){}
        else if(handleNo2Slope(comName, data)){}
        else if(handleNo2Offset(comName, data)){}
        else if(handleCoSensitivity(comName, data)){}
        else if(handleCoSlope(comName, data)){}
        else if(handleCoOffset(comName, data)){}
        else if(handleSo2Sensitivity(comName, data)){}
        else if(handleSo2Slope(comName, data)){}
        else if(handleSo2Offset(comName, data)){}
        else if(handleO3Sensitivity(comName, data)){}
        else if(handleO3Slope(comName, data)){}
        else if(handleO3Offset(comName, data)){}
        else if(handlePmOffset(comName, data)){}
        else if(handlePmOffset(comName, data)){}
        else if(handleTemperatureOffsetDegC(comName, data)){}
        else if(handleTemperatureOffsetDegF(comName, data)){}
        else if(handleHumidityOffset(comName, data)){}
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