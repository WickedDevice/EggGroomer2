(function(){
    var app = angular.module('egg-groomer', [ ]);

    app.controller('EggsController', function(){
        var mv = this;
        mv.serialPorts = attachedSerialPorts;
        mv.eggs = attachedEggs;
        mv.formDatabase = formDatabase;
    });

    var attachedEggs = [
        /*
        {
            sensorType: "NO2 / CO",
            serial: {
                macAddress: "AB:CD:EF:01:23:45"
                ...
            },
            form: {
                macAddress: "01:23:45:AB:CD:EF"
                ...
            }
        }
        */
    ];
    var attachedSerialPorts = [];
    var formDatabase = [];
})();