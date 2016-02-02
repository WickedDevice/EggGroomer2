(function(){
    var app = angular.module('egg-groomer', [ ]);

    app.controller('EggsController', ['$http', function($http){
        var mv = this;
        mv.eggs = [];

        var numSerialPortsProcessed = 0;

        function findOrCreateAttachedEggFromForm(formData){
            var foundEgg = false;
            for(var ii = 0; ii < mv.eggs.length; ii++){
                if(mv.eggs[ii].serial && (mv.eggs[ii].serial.eggSerialNumber.value == formData.openSensorsUsername)){
                    mv.eggs[ii].form = formData;
                    foundEgg = true;
                    return;
                }
                else if(mv.eggs[ii].form && (mv.eggs[ii].form.openSensorsUsername == formData.openSensorsUsername)){
                    mv.eggs[ii].form = formData;
                    foundEgg = true;
                    return;
                }
            }

            if(!foundEgg){
                mv.eggs.push({
                    active: false,
                    form: formData
                });
            }
        }

        function findOrCreateAttachedEggFromSerial(serialData){
            var foundEgg = false;
            for(var ii = 0; ii < mv.eggs.length; ii++){
                if(mv.eggs[ii].form && (mv.eggs[ii].form.openSensorsUsername == serialData.eggSerialNumber.value)){
                    mv.eggs[ii].serial = serialData;
                    foundEgg = true;
                    if(numSerialPortsProcessed == 0){
                        mv.eggs[ii].active = true;
                    }
                    return;
                }
                else if(mv.eggs[ii].serial && (mv.eggs[ii].serial.eggSerialNumber.value == serialData.eggSerialNumber.value)){
                    mv.eggs[ii].serial = serialData;
                    foundEgg = true;
                    if(numSerialPortsProcessed == 0){
                        mv.eggs[ii].active = true;
                    }
                    return;
                }
            }

            if(!foundEgg){
                if(numSerialPortsProcessed == 0){
                    mv.eggs.push({
                        active: true,
                        serial: serialData
                    });
                }
                else{
                    mv.eggs.push({
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
                $http.get('/serialports/eggs').success(function(data){
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

        $http.get('/googleform').success(function( data ) {
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
    }]);

})();