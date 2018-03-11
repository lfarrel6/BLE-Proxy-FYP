var noble                      = require('noble')
  , coap                       = require('coap')
  , async                      = require('async')
  , server                     = coap.createServer()
  , discoveries                = []
  , discoveries_LUT            = {}   //To allow for more simple indexing of peripherals using a lut to relate id's to indexes 
  , proximity_timeout          = 2000 //if a discovery is out of range after 2000 milliseconds, delete it from our list
  , services_lookup_table      = require('./assets/services-lut.json')
  , reverse_services_lut       = require('./assets/reversed-services-lut.json')
  , chars_lut                  = require('./assets/characteristic-lut.json')
  , reverse_chars_lut          = require('./assets/reversed-characteristics-lut.json');

server.on('request', function(req, res){
	console.log(req.method + ' request');

	switch(req.method){
		case 'GET':

			get(req.url, res);
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

function get(url, response){
	var splitUrl = url.split('/');

	//coap standard uri for important information on server
	if(splitUrl.length > 2 && splitUrl[1] === '.well-known' && splitUrl[2] === "core"){
		wellKnown(response);
	} else{
		//process get requests for other devices
		//URI structure: https://docs.google.com/document/d/1GqtmLli6Ir9sQcguDK4Bmhh9O_I5s4M740KlFlFNurI/

		if(splitUrl.length > 2){

			var deviceId = splitUrl[1];

			if(splitUrl[2] == "exp"){
				//explore this device
				getServices(deviceId);
			}else{
				//service interaction
				var service = splitUrl[2];
				/*
				service will contain a UUID
				interact with service/characteristic
				- requires service validation
				*/

				var deviceJSON = discoveries[deviceId];
				if(deviceJSON.paths.includes(service)){

					if(deviceJSON.inRange){
						var characteristic = splitUrl[3];
						//get request to a characteristic is a read
					
						read(response,deviceJSON,service,characteristic);
					}else{
						response.write("Device has gone out of range");
						requestComplete(response,2);
					}

				}else{
					response.write("service does not exist");
					requestComplete(response, 1);
				}

			}
		}else{
			response.write("Invalid URI");
			requestComplete(response,1);
		}
	}
}

function wellKnown(res){
	console.log('Well Known');

	var modLUT = {};

	//discovery will hold the json keys (the peripheral ids)
	for(var discovery in discoveries_LUT){
		//modLUT will be id:jsonInfo from noble discovery
		modLUT[discovery] = discoveries[ discoveries_LUT[discovery] ];
	}

	res.json(modLUT);
	requestComplete(res, 0);
}

function isNumeric(str){ return !isNaN(str); }

function requestComplete(response, status){
	if(status == 0){
		response.code = '2.01'; // message code complies with CoAP standards (success)
	}else if(status == 1){
		response.code = '4.01'; // message code complies with CoAP standards (client failure)
	}else{
		response.code = '5.01'; // message code complies with CoAP standards (server failure)
	}
	response.end('\n');
}


//Provide coap port
server.listen(5683, function(){
	console.log('Server started.')
});

/**

|--------------------------------------------------------------------------------------------------------------------------------------------------|
|Noble code below - current functionality maintains a list of devices in proximity, removing after a 2000ms time interval if they haven't been seen|
|--------------------------------------------------------------------------------------------------------------------------------------------------|

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
	if(!discoveries_LUT[id]){
		var peripheralInfo = id + ' (' + peripheral.advertisement.localName + ')';
		
		var this_index = discoveries.length;
		discoveries_LUT[id] = this_index;

		discoveries.push({
			"peripheral": peripheral,
			"info": peripheralInfo,
			"inRange": true,
			"paths": getServices(this_index),
			"lastSeen": Date.now()
		});
		console.log('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date());

		//getCharacteristics( reverse_services_lut[discoveries[this_index].paths[0]] );

	}

	discoveries[ discoveries_LUT[id] ].lastSeen = Date.now();
});

function getServices(index){
	var requestedPeripheral = discoveries[index].peripheral;

	var url_paths = [];

	requestedPeripheral.on('disconnect', function(){
		console.log('> Requested Peripheral disconnect');
		console.log('Peripheral disconnect @ ' + Date.now());
		noble.startScanning();
	});

	requestedPeripheral.connect(function(err){
		requestedPeripheral.discoverServices([], function(error, services){
			var i = 0, paths = 0;

			async.whilst(
				function(){ return i < services.length; },
				function(callback){
					var service = services[i];

			        if (services_lookup_table[service.uuid]) {
			        	url_paths[paths] = service.uuid;
			        	paths++;

			        	console.log('> ' + services_lookup_table[service.uuid]);
			        }
			        i++;
			        callback(null, url_paths);
				},
				function(err, results){ 
					if(err){
						requestedPeripheral.disconnect();
					}else{
						return results;
					}
				}
			);
		});
	});
}

/*
peripheral: noble peripheral object with which connection is being sought
uuid: desired services uuid
*/
function getCharacteristics(peripheral, uuid){
	var info = [];
	peripheral.discoverServices([uuid], function(error, services){
		
		var i = 0;

		async.whilst(
			function(){ return i < services.length; },
			function(callback){
				var service = services[i];

				service.discoverCharacteristics([], function(error, characteristics){

					var j = 0;

					async.whilst(
						function(){ return j < characteristics.length; },
						function(nested_callback){
							var characteristic = characteristics[j];

							nested_callback(null, info.push(characteristic));
							j++;
						},
						function(err,results){
							if(err){
								callback(err);
							}else{
								callback(null,results);
							}
						}
					);

				});
				i++;
			},
			function(err,results){
				if(err){
					console.log(err);
				}else{
					return results;
				}
			}
		);
	});
}

/*
read give characteristic
*/
function read(response, deviceJSON, service, characteristic){
	var peripheral = deviceJSON.peripheral;

	peripheral.connect(function(conn_error){
		peripheral.discoverServices([service],function(service_err, services){

			if(service_err){
				console.log("Error in connecting to service ", services_lookup_table[service]);
				console.log(service_err);
			}else{
				var i = 0;
				async.whilst(
					function(){ return i < services.length; },
					function(callback){
						var service = services[i];

						service.discoverCharacteristics([characteristic], function(character_err,characteristics){
				
							if(character_err){
								console.log("Error connecting to characteristic ", chars_lut[characteristic]);
								console.log(character_err);
							}else{
								var response_data;
				
								var j = 0;

								async.whilst(
									function(){ return j < characteristics.length; },
									function(nested_callback){
										var c = characteristics[j];

										c.read(function(err,data){
											if(err){
												console.log("Error reading characteristic ", chars_lut[c]);
												console.log(err);
											
												nested_callback(err);
											}else{
												response_data+=data;
												nested_callback(null,response_data);
											}
										});
										j++;
									},
									function(err, results){
										if(err){
											console.log("Error during Characteristic read\n", err);
											callback(err);
										}else{
											callback(null,results);
										}
									}
								);
							}
							i++;
						}
					},
					function(err,results){
						if(err){
							console.log(err);
						}else{
							response.json(results);
							requestComplete(response,0);
						}
					}
				);
			}
		});
	});
}

setInterval(function(){
	for(var id in discoveries){
		if(discoveries[id].lastSeen < (Date.now() - proximity_timeout)){
			console.log('> Lost peripheral ' + discoveries[id].info);

			discoveries[id]["inRange"] = false;
		}
	}
}, proximity_timeout/2); //check list every 1000ms to see if devices have been lost


























/*
peripheral: noble peripheral object with which connection is being sought
uuid: desired services uuid
*/

// connectToService replaced by getCharacteristics

/*function connectToService(peripheral, uuid){
	var information = {};
	peripheral.discoverServices([uuid], function(error, services){
		//there should only be one service discovered
		var serviceIndex = 0;

		async.whilst(
			function(){ return serviceIndex < services.length; },
			function(callback){
				var service = services[serviceIndex];
			    var serviceInfo = service.uuid;

			    information[serviceInfo] = {};

			    service.discoverCharacteristics([], function(error, characteristics){

			    	//interacting with service characteristics here
			    	var i = 0;

			    	async.whilst(
			    		function(){	return (i < characteristics.length); },
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
			    							console.log(characteristicInfo);
			    							callback();
			    						});
			    					} else{
			    						callback();
			    					}
			    				}, function(){
			    					console.log(characteristicInfo);
			    					information[serviceInfo][i] = characteristicInfo;
			    					i++;
			    					callback();
			    				}
			    			]);
			    			i++;
			    		},
			    		function(error){
			    			i++;
			    			callback();
			    		}
			    	);
			    });

			    serviceIndex++;
			},
			function(err){ peripheral.disconnect(); }
		);
	});
}*/
