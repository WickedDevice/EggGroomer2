(function(){
    var app = angular.module('egg-groomer', [ ]);

    app.controller('EggsController', function(){
        var mv = this;
        mv.eggs = attachedEggs;
    });

    var attachedEggs = [
/*
        {
            active: true,
            serial: {
                macAddress: { value: "AB:CD:EF:01:23:45"}
                //...
            },
            form: {
                macAddress: "01:23:45:AB:CD:EF"
               // ...
            }
        }
*/
    ];

    var numSerialPortsProcessed = 0;

    function findOrCreateAttachedEggFromForm(formData){
        var foundEgg = false;
        for(var ii = 0; ii < attachedEggs.length; ii++){
            if(attachedEggs[ii].serial && (attachedEggs[ii].serial.eggSerialNumber.value == formData.openSensorsUsername)){
                attachedEggs[ii].form = formData;
                foundEgg = true;
                return;
            }
            else if(attachedEggs[ii].form && (attachedEggs[ii].form.openSensorsUsername == formData.openSensorsUsername)){
                attachedEggs[ii].form = formData;
                foundEgg = true;
                return;
            }
        }

        if(!foundEgg){
            attachedEggs.push({
                active: false,
                form: formData
            });
        }
    }

    function findOrCreateAttachedEggFromSerial(serialData){
        var foundEgg = false;
        for(var ii = 0; ii < attachedEggs.length; ii++){
            if(attachedEggs[ii].form && (attachedEggs[ii].form.openSensorsUsername == serialData.eggSerialNumber.value)){
                attachedEggs[ii].serial = serialData;
                foundEgg = true;
                if(numSerialPortsProcessed == 0){
                    attachedEggs[ii].active = true;
                }
                return;
            }
            else if(attachedEggs[ii].serial && (attachedEggs[ii].serial.eggSerialNumber.value == serialData.eggSerialNumber.value)){
                attachedEggs[ii].serial = serialData;
                foundEgg = true;
                if(numSerialPortsProcessed == 0){
                    attachedEggs[ii].active = true;
                }
                return;
            }
        }

        if(!foundEgg){
            if(numSerialPortsProcessed == 0){
                attachedEggs.push({
                    active: true,
                    serial: serialData
                });
            }
            else{
                attachedEggs.push({
                    active: false,
                    serial: serialData
                });
            }
            numSerialPortsProcessed++;
        }
    }



    $.getJSON('/serialports', function( meh ) {
        numSerialPortsProcessed = 0;
        setInterval(function(){
            $.getJSON('/serialports/eggs', function(data){
                // for each egg that you find in the results
                // look for a corresponding serial entry
                // and if you don't find one, create a new one
                // then put the egg data into the serial field
                var serialNumbers = Object.keys(data);
                for(var ii = 0; ii < serialNumbers.length; ii++){
                    findOrCreateAttachedEggFromSerial(data[serialNumbers[ii]]);
                }
            });
        }, 1000);
    });

    $.getJSON('/googleform', function( data ) {
        console.log(data);
        // for each egg that you find in the results
        // look for a corresponding serial entry
        // and if you don't find one, create a new one
        // then put the egg data into the form field
        var serialNumbers = Object.keys(data);
        for(var ii = 0; ii < serialNumbers.length; ii++){
            findOrCreateAttachedEggFromForm(data[serialNumbers[ii]]);
        }
    });

})();