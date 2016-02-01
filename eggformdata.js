var Promise = require("bluebird");
var Spreadsheet = require('edit-google-spreadsheet');
var config = require('../google-config');
var Spreadsheet = Promise.promisifyAll(require('edit-google-spreadsheet'));

module.exports = (function(){
    var form_database = {};

    function stripLeadingTickAndEgg(str){
        var ret = str;
        if(ret.length >= 1 && ret.slice(0,1) == "'"){
            ret = str.slice(1);
        }

        //if(ret.length >= 3 && ret.slice(0,3) == "egg"){
        //    ret = str.slice(3);
        //}

        return ret;
    }

    var headerRowToObjectFieldName = {
        "CC3000 MAC address": "macAddress",
        "Open Sensors .io password": "openSensorsPassword",
        "Shipped Firmware Version": "shippedFirmwareVersion",
        "CO Serial Number": "coSerialNumber",
        "CO Date Code": "coDateCode",
        "CO Sensitivity": "coSensitivity",
        "CO Sensor Zero Value": "coOffset",
        "NO2 Sensor Serial Number": "no2SerialNumber",
        "NO2 Sensor Date Code": "no2DateCode",
        "NO2 Sensitivity": "no2Sensitivity",
        "NO2 Sensor Zero Value": "no2Offset",
        "O3 Sensor Serial Number": "o3SerialNumber",
        "O3 Sensor Date Code": "o3DateCode",
        "O3 Sensitivity": "o3Sensitivity",
        "O3 Sensor Zero Value": "o3Offset",
        "SO2 Sensor Serial Number": "so2SerialNumber",
        "SO2 Sensor Date Code": "so2DateCode",
        "SO2 Sensitivity": "so2Sensitivity",
        "SO2 Sensor Zero Value": "so2Offset",
        "Paritculate Sensor Zero Value": "pmOffset",
        "Date Shipped to customer": "dateShipped",
        "Customer Name": "customerName",
        "Customer Email": "customerEmail",
        "Customer Order Number": "customerOrderNumber",
        "Customer Address": "customerAddress",
        "SHT25 / Egg Serial Number": "openSensorsUsername",
        "Temperature Offset": "temperatureOffset",
        "Humidity Offset": "humidityOffset"
    };

    function processRows(rows){
        //console.log("Found rows:", rows);
        var first_row = rows[1];
        var num_fields = Object.keys(first_row).length

        // create the inverse lookup mapping
        var field_map = {};
        for(field in first_row){
            field_map[first_row[field]] = field;
        }

        // go through each row and add it to the database
        var num_rows = Object.keys(rows).length;

        for(var i = 2; i <= num_rows; i++) {

            var egg_serial_number;
            try{
                egg_serial_number = rows[i][field_map["SHT25 / Egg Serial Number"]];
            }
            catch(err){
                console.log("Error on spreadsheet row " + i + " - skipping contents");
                continue;
            }
            // if egg_serial_number has a leading appostrophe, remove it.
            if(!egg_serial_number){
                egg_serial_number = "";
            }

            egg_serial_number = stripLeadingTickAndEgg(egg_serial_number);
            if(!egg_serial_number || egg_serial_number == "") continue;

            for(var field in rows[i]){
                if(!form_database[egg_serial_number]){
                    // need a new entry, seed it with empty arrays
                    form_database[egg_serial_number] = {};
                    for(var ffield in first_row){
                        if(headerRowToObjectFieldName[first_row[ffield]]) {
                            form_database[egg_serial_number][headerRowToObjectFieldName[first_row[ffield]]] = [];
                        }
                    }
                }

                // add the field data to it, now that it must exist
                if(first_row[field]) {
                    var objFieldName = headerRowToObjectFieldName[first_row[field]];
                    if(objFieldName) {
                        form_database[egg_serial_number][objFieldName].push(
                            stripLeadingTickAndEgg(rows[i][field])
                        );
                    }
                }
            }
        }
    }

    function flattenFormDatabase(){
        var eggSerialNumbers = Object.keys(form_database);
        var mappedHeaderFieldKeys = Object.keys(headerRowToObjectFieldName);
        var mappedHeaderFields = [];
        for(var kk = 0; kk < mappedHeaderFieldKeys.length; kk++){
            mappedHeaderFields.push(headerRowToObjectFieldName[mappedHeaderFieldKeys[kk]]);
        }

        // traverse the object and inspect the array lengths
        for(var ii = 0; ii < eggSerialNumbers.length; ii++){
            for(var jj = 0; jj < mappedHeaderFields.length; jj++){
                if(mappedHeaderFields[jj] == "openSensorsUsername" && form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]].length >= 1){
                    // keep an openSensorsUsername no matter what
                    form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]] =
                        form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]][0];
                }
                else if(form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]].length == 1){
                    // it's unreliable data if you have 0 or more than 1 distinct value
                    form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]] =
                        form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]][0];
                }
                else{
                    delete form_database[eggSerialNumbers[ii]][mappedHeaderFields[jj]];
                }
            }
        }
    }

    function loadDatabase() {
        form_database = {};
        return  Promise.try(function(){
            return Spreadsheet.loadAsync({
                debug: true,
                useCellTextValues: false, // false? seriously? yup.
                spreadsheetId: config["google-spreadsheetId"],
                worksheetId: config["google-worksheetId"],
                oauth2: config["google-oauth2"]
            });
        }).catch(function(err){
            console.log(err);
        }).then(function (spreadsheet) {
            Promise.promisifyAll(spreadsheet);
            return Promise.try(function(){
                return spreadsheet.receiveAsync();
            }).catch(function(err){
                console.log(err);
                // throw error?
            }).then(function (rows, info) {
                processRows(rows);
                flattenFormDatabase();
                return form_database;
            });
        });
    }

    function getEggData(serialNumber){
        var serialNumber = stripLeadingTickAndEgg(serialNumber);
        return form_database[serialNumber];
    }

    return { // export public methods
        load: loadDatabase
    };
})();