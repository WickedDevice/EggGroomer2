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

        if(ret.length >= 3 && ret.slice(0,3) == "egg"){
            ret = str.slice(3);
        }

        return ret;
    }

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

            for(var field in rows[i]){
                if(!form_database[egg_serial_number]){
                    // need a new entry, seed it with empty arrays
                    form_database[egg_serial_number] = {};
                    for(var ffield in first_row){
                        form_database[egg_serial_number][first_row[ffield]] = [];
                    }
                }

                // add the field data to it, now that it must exist
                if(first_row[field]) {
                    form_database[egg_serial_number][first_row[field]].push(
                        stripLeadingTickAndEgg(rows[i][field])
                    );
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