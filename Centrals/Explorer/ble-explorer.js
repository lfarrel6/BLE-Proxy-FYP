var noble                      = require('noble')
  , coap                       = require('coap')
  , async                      = require('async')
  , server                     = coap.createServer()
  , discoveries                = []
  , proximity_timeout          = 2000 //if a discovery is out of range after 2000 milliseconds, delete it from our list
  , services_lookup_table      = require('./assets/services-lut.json')
  , reverse_services_lut       = require('./assets/reversed-services-lut.json')
  , chars_lut                  = require('./assets/characteristic-lut.json')
  , reverse_chars_lut          = require('./assets/reversed-characteristics-lut.json');

server.on('request', function(req, res){
	console.log(req.method + ' request');

	switch(req.method){
		case 'GET':
			console.log('Request URL: ' + req.url);
			console.log('Split URL: ' + req.url.split('/'));

			var args = req.url.split('/');

			if(args.length > 1){

				var id = args[1];
				console.log('ID requested: ' + id);

				var requested_peripheral = discoveries[id];

				if(requested_peripheral && requested_peripheral["available"]){
					console.log("> Available paths: " + discoveries[id]["paths"]);

					var pathValidity = discoveries[id]["paths"].includes(args[2]);
					console.log("> Path requested: " + args[2] + " - is valid: " + pathValidity);

					if(pathValidity){
						console.log("> Connecting to service.")

						connectToService(discoveries[id], reverse_lut[args[2]]);
					}

				}
				requestComplete(res, avail);
			}else{
				// return all discoveries
				for(var discovered in discoveries){
					res.write(discovered.info + '\n');
				}
				requestComplete(res, 0);
			}

			break;
		//case    'PUT':
		//case   'POST':
		//case 'DELETE':
		default:
			res.write('Sorry, the server is not yet configured for ' + req.method + ' requests.');
			res.end('\n');
			break;
	}
});

function getInformation(id){
	var requestedPeripheral = discoveries[id].peripheral;

	var url_paths = [];

	requestedPeripheral.on('disconnect', function(){
		console.log('> Requested Peripheral disconnect');
		console.log('Peripheral disconnect @ ' + Date.now());
	});

	requestedPeripheral.connect(function(err){
		requestedPeripheral.discoverServices([], function(error, services){
			var i = 0, paths = 0;

			async.whilst(
				function(){ return i < services.length; },
				function(callback){
					var service = services[serviceIndex];
			        var serviceInfo = service.uuid;

			        if (lookup_table[service.uuid]) {
			        	url_paths[paths] = lookup_table[service.uuid];
			        	paths++;

			        	console.log('> ' + lookup_table[service.uuid]);
			        }
			        i++;
				},
				function(err){ requestedPeripheral.disconnect(); }
			);
		});
	});
	return url_paths;
}

function requestComplete(response, status){
	if(status == 0){
		response.code = '2.01'; // message code complies with CoAP standards (success)
	}else if(status == 1){
		response.code = '4.01'; // message code complies with CoAP standards (client failure)
	}else{
		response.code = '5.01'; // message code complies with CoAP standards (client failure)
	}
	response.end('\n');
}

function connectToService(peripheral, uuid){
	peripheral["peripheral"].discoverServices([uuid], function(error, services){
		//there should only be one service discovered
		var serviceIndex = 0;

		async.whilst(
			function(){ return i < services.length; },
			function(callback){
				var service = services[serviceIndex];
			    var serviceInfo = service.uuid;

			    service.discoverCharacteristics([], function(error, characteristics){

			    	//interacting with service characteristics here
			    	var i = 0;

			    	async.whilst(
			    		function(){
			    			return (i < characteristics.length);
			    		},
			    		function(callback){
			    			var characteristic = characteristics[i];
			    			var characteristicInfo = ' ' + characteristic.uuid;
			    			
			    			if(characteristic.name){
			    				characteristicInfo += ' (' + characteristic.name + ')';
			    			}

			    			async.series([
			    				function(callback){
			    					characteristic.discoverDescriptors(function(error, descriptors){
			    						async.detect(
			    							descriptors,
			    							function(descriptor, callback){
			    								if(descriptor.uuid === '2901'){
			    									return callback(descriptor);
			    								}else{
			    									return callback();
			    								}
			    							},
			    							function(userDescriptionDescriptor){
			    								if(userDescriptionDescriptor){
			    									userDescriptionDescriptor.readValue(function(error, data){
			    										if(data){
			    											characteristicInfo += ' (' + data.toString() + ')';
			    										}
			    										callback();
			    									});
			    								}else{
			    									callback();
			    								}
			    							}
			    						);
			    					});
			    				}, function(callback){
			    					characteristicInfo += '\n 	properties  ' + characteristic.properties.join(', ');
			    					if(characteristic.properties.indexOf('read') !== -1){
			    						characteristic.read(function(error, data){
			    							if(data){
			    								var string = data.toString('ascii');

			    								characteristicInfo += '\n 	value 	' + data.toString('hex') + '| \'' + string + '\'';
			    							}
			    							callback();
			    						});
			    					} else{
			    						callback();
			    					}
			    				}, function(){
			    					console.log(characteristicInfo);
			    					i++;
			    					callback();
			    				}
			    			]);
			    		},
			    		function(error){
			    			i++;
			    			callback();
			    		}
			    	);
			    });

			    serviceIndex++;
			},
			function(err){ requestedPeripheral.disconnect(); }
		);
	});
}

//Provide coap port
server.listen(5683, function(){
	console.log('Server started.')
});

/**
Noble code below - current functionality maintains a list of devices in proximity, removing after a 2000ms time interval if they haven't been seen 
**/

noble.on('stateChange', function(state){
	console.log('State Change Event... ', state);
	if(state === 'poweredOn'){
		//Search for any uuid, don't accept duplicates
		noble.startScanning([], false);
	} else{ 
		noble.stopScanning();
	}
});

noble.on('scanStart', function(){
	console.log('> Scanning...');
});

noble.on('scanStop', function(){
	console.log('> Stopping Scanning...');
});

//discover function used to maintain list of surrounding devices (i.e. discoveries)
noble.on('discover', function(peripheral){
	console.log('> Peripheral Discovered');

	var id = peripheral.id;

	//if discovery is new
	if(!discoveries[id]){
		var peripheralInfo = peripheral.id + ' (' + peripheral.advertisement.localName + ')';
		discoveries[id] = {
			"peripheral": peripheral,
			"info": peripheralInfo,
			"available": true,
			"paths": getInformation(peripheral.id)
		};
		console.log('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date());
	}

	discoveries[id].lastSeen = Date.now();
});

setInterval(function(){
	for(var id in discoveries){
		if(discoveries[id].lastSeen < (Date.now() - proximity_timeout)){
			console.log('> Lost peripheral ' + discoveries[id].info);

			discoveries[id]["available"] = false;
		}
	}
}, proximity_timeout/2); //check list every 1000ms to see if devices have been lost