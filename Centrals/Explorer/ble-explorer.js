var noble                      = require('noble')
  , coap                       = require('coap')
  , async                      = require('async')
  , chalk                      = require('chalk')
  , server                     = coap.createServer()
  , discoveries                = []
  , discoveries_LUT            = {}   //To allow for more simple indexing of peripherals using a lut to relate id's to indexes 
  , proximity_timeout          = 5000 //if a discovery is out of range after 2000 milliseconds, delete it from our list
  , services_lookup_table      = require('./assets/services-lut.json')
  , reverse_services_lut       = require('./assets/reversed-services-lut.json')
  , chars_lut                  = require('./assets/characteristic-lut.json')
  , reverse_chars_lut          = require('./assets/reversed-characteristics-lut.json')
  , config                     = require('./assets/config.json');

var connected_peripheral, connected = false;

function initialisePeripheral(){
	if(connected_peripheral){
		connected_peripheral.on('disconnect', function(){
			console.log('Disconnected from peripheral');
			console.log(chalk.inverse('connected: ' + connected));
			noble.startScanning();
		});

		//console.log('Initialising connection with: ' + JSON.stringify(connected_peripheral));

		connected_peripheral.connect(function(err){
			if(err){
				connected = false;
				console.log(chalk.red(err));
			}else{
				noble.stopScanning();
				connected = true;
				console.log('Connection established');
			}
		})

	}
}

function disconnectPeripheral(){
	if(connected_peripheral){
		connected = false;
		connected_peripheral.disconnect();
		connected_peripheral = null;
		noble.startScanning();
	}
}


server.on('request', function(req, res){
	console.log(chalk.green(req.method + ' request'));

	switch(req.method){
		case 'GET':
			console.log(chalk.cyan('GET REQUEST RECEIVED'));
			if(req.headers['Observe']!==0)
				return get(req.url, res);
			get(req.url,res,true);
			//console.log(chalk.cyan('OUTGOING RES PAYLOAD: ' + res.payload));
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

function get(url, response, obs=false){
	var splitUrl = url.split('/');

	if(splitUrl.length == 2){
		disconnectPeripheral();
		console.log(chalk.blue('ALIVE'));
		response.write('roger');
		response.end();
	}

	//coap standard uri for important information on server
	if(splitUrl.length > 2 && splitUrl[1] === '.well-known' && splitUrl[2] === "core"){
		disconnectPeripheral();
		console.log(chalk.cyan('WELL KNOWN REQUEST'));
		console.log(splitUrl);
		if(splitUrl.length==4){
			wellKnown(response,splitUrl[3]);
		}else{
			wellKnown(response);
		}

	} else{
		//process get requests for other devices
		//URI structure: https://docs.google.com/document/d/1GqtmLli6Ir9sQcguDK4Bmhh9O_I5s4M740KlFlFNurI/

		if(splitUrl.length > 2){

			var deviceId = splitUrl[1];

			if(!discoveries[deviceId]){
				response.write('Unknown device id');
				response.end();
			}else{

				if(!connected_peripheral){
					console.log('No peripheral connected');
					connected_peripheral = discoveries[deviceId].peripheral;
				}else if(connected_peripheral !== discoveries[deviceId].peripheral){
					console.log('Switching peripheral');
					disconnectPeripheral();
					connected_peripheral = discoveries[deviceId].peripheral;
					initialisePeripheral();
				}
				if(!connected){
					console.log('Connecting to peripheral');
					initialisePeripheral();
				}

				if(splitUrl[2] == "exp"){
					console.log(chalk.cyan('Exploring device:' + deviceId));
					//explore this device

					if(discoveries[deviceId]){
						//if(discoveries[deviceId].explored){
						if(discoveries[deviceId].paths){
							response.write(JSON.stringify(discoveries[deviceId].paths));
							response.end();
						}else{
							getServicesSync(deviceId,response);
						}
					}else{
						console.log(chalk.red('Error: Unknown peripheral'));
						response.write('Unknown device id');
						response.end();
					}
				}else{
					//service interaction
					var service = splitUrl[2];

					/*
					service will contain a UUID
					interact with service/characteristic
					- requires service validation
					*/

					var deviceJSON = discoveries[ deviceId ];
					console.log(chalk.inverse('paths[service] = ' + JSON.stringify(deviceJSON.paths[service])));
					if(deviceJSON && deviceJSON.paths[service]){


						if(splitUrl.length == 5){// && (splitUrl[4] == 'read' || splitUrl[4] == 'sub')){
							if(splitUrl[4] == 'read'){
								console.log('read');
								read(response,service,splitUrl[3]);
							}else if(splitUrl[4] == 'sub'){
								console.log('sub');
								if(obs){
									testSub(service,splitUrl[3],response);
								}else{
									subscribe(service,splitUrl[3],response);
								}
							}
						} else if(deviceJSON.inRange){
							console.log(chalk.inverse('Device in range'));
							var argFour = splitUrl[3];
							if(argFour == 'getChars'){
								var keys = Object.keys(deviceJSON.paths[service]);
								if(keys.length > 0){
									response.write(deviceJSON.paths[service]);
									response.end();
								}else{
									getCharacteristics(deviceId, service, response);
								}

							}
						}else{
							response.write("Device has gone out of range");
							requestComplete(response,2);
						}

					}else{
						response.write("service does not exist");
						requestComplete(response, 1);
					}

				}
			}
		}else{
			response.write("Invalid URI");
			requestComplete(response,1);
		}
	}
}

function wellKnown(res,index=null){

	console.log(chalk.cyan('WELL KNOWN PROCESSING'));
	var modLUT = {};

	var i = 0;
	if(index){
		i = index;
	}
	var responseLength = 0;
	var getDiscoveries;
	var keys = Object.keys(discoveries_LUT);
	
	var getDiscoveries = new Promise(function(resolve,reject){
		async.whilst(
			function(){ return i < keys.length && responseLength < 5; },
			function(callback){
				var thisDiscovery = discoveries[ discoveries_LUT[ keys[i] ] ];
				modLUT[ discoveries_LUT[keys[i]] ] = { 'info': thisDiscovery.info, 'available': thisDiscovery.inRange };

				i++; responseLength++;
				callback(null,modLUT);
			},
			function(err,res){
				if(err){
					reject(err);
				}else{ 
					if(Object.keys(res).length > 0){
						resolve(JSON.stringify(res));
					}else{
						resolve('N/A');
					}
				}
			}
		);
		//if function doesn't complete in 15 seconds, force timeout
		getDiscoveries = setTimeout(reject('Timeout'),10000);
	});
	getDiscoveries.then(function(result){
		clearTimeout(getDiscoveries);
		res.write(result);
		res.end();
	}).catch(function(err){
		console.log(chalk.red(err));
		res.write(err);
		res.end();
	});

}

function isNumeric(str){ return !isNaN(str); }


//Provide coap port
server.listen(config.coapPort, function(){
	console.log(chalk.green('> Server started.'));
});

/**

|--------------------------------------------------------------------------------------------------------------------------------------------------|
|Noble code below - current functionality maintains a list of devices in proximity, removing after a 2000ms time interval if they haven't been seen|
|--------------------------------------------------------------------------------------------------------------------------------------------------|

**/

noble.on('stateChange', function(state){
	console.log(chalk.green('> State Change Event... ' + state));
	if(state === 'poweredOn'){
		//Search for any uuid, don't accept duplicates
		noble.startScanning(config.allowedDevices, true);
	} else{ 
		noble.stopScanning();
	}
});

noble.on('scanStart', function(){
	console.log(chalk.green('> Scanning...'));
});

noble.on('scanStop', function(){
	console.log(chalk.green('> Stopping Scanning...'));
});

//discover function used to maintain list of surrounding devices (i.e. discoveries)
noble.on('discover', function(peripheral){
	var id = peripheral.id;


	//if discovery is new
	if(!discoveries_LUT[id]){

		var peripheralInfo = 'Device id: ' + id + ' Local Name: ' + peripheral.advertisement.localName;
		
		console.log(chalk.green('> Peripheral Info: ' + peripheralInfo));

		var this_index = discoveries.length;
		discoveries_LUT[id] = this_index;

		discoveries.push({
			"peripheral": peripheral,
			"info": peripheralInfo,
			"inRange": true,
			"lastSeen": Date.now(),
			"explored": false
		});
		//console.log(chalk.magenta(JSON.stringify(peripheral.advertisement.serviceData)+'\n'+JSON.stringify(peripheral.advertisement.serviceUuids)));
		var services = {};
		if(peripheral.advertisement.serviceData && peripheral.advertisement.serviceData.length > 0){
			
			for(var s in peripheral.advertisement.serviceData){
				services[(peripheral.advertisement.serviceData[s].uuid)]={};
			}
			console.log(chalk.magenta('Advertisement Services: ' + services));
		}
		if(peripheral.advertisement.serviceUuids && peripheral.advertisement.serviceUuids.length > 0){
			for(var uuid in peripheral.advertisement.serviceUuids){
				services[(peripheral.advertisement.serviceUuids[uuid])]={};
			}
		}
		if(Object.keys(services).length>0){
			discoveries[this_index].paths = services;
		}

		console.log(chalk.green('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date()));

	}

	discoveries[ discoveries_LUT[id] ].lastSeen = Date.now();
	if(!discoveries[ discoveries_LUT[id] ].inRange){
		console.log(chalk.green('> Peripheral back in range'));
		discoveries[ discoveries_LUT[id] ].inRange = true;
	}
});

function getServicesSync(index,response){

	var url_paths={};

	var serviceTimeout;

	var retrieveServicesSync = new Promise(function(resolve,reject){
		console.log('Synchronous service retrieval');

		if(!connected){
			connected_peripheral.connect(function(err){
				if(err){
					reject(err);
				}else{
					connected = true;
				}
			});
		}
		connected_peripheral.discoverServices([],function(error,services){
			if(error){
				reject(error);
			}else{
				for(var i = 0; i < services.length; i++){
					console.log(chalk.bgGreen(services[i].uuid));
					url_paths[services[i].uuid] = {};
				}
				discoveries[index].explored = true;
				if((discoveries[index].paths) && Object.keys(discoveries[index].paths).length < Object.keys(url_paths).length){
					disoveries[index].paths = url_paths;
					
				}
				resolve(JSON.stringify(discoveries[index].paths));
			}
		});
		
		//call timeout after 30 seconds
		serviceTimeout = setTimeout(function(){
			reject('Timeout');
		}, 30000);
	});
	
	retrieveServicesSync.then(function(result){
		if(serviceTimeout){
			clearTimeout(serviceTimeout);
		}
		console.log('Successfully retrieved services sync');
		response.write(result);
		response.end();
	});
	retrieveServicesSync.catch(function(err){
		response.write('Error: ' + err);
		response.end();
	});

}

//response optional parameter
function getServices(index,response){

	console.log(chalk.cyan('Fetching Services'));
	var url_paths = {};
	var serviceTimeout;
	var serviceRetrieval = new Promise(function(resolve,reject){
		
		if(!connected && connected_peripheral){
			connected_peripheral.connect(function(err){
				if(err){
					reject(err);
				}else{
					connected = true;
				}
			});
		}

		connected_peripheral.discoverServices([], function(error,services){

			var i = 0, paths = 0;

			async.whilst(
				function(){ return i < services.length; },
				function(callback){
					var service = services[i];

					if(!url_paths[service.uuid]){
						url_paths[service.uuid] = {};
					}
					i++;

					callback(null,url_paths);
				},
				function(serviceErr, results){
					if(serviceErr){
						reject(serviceErr);
					}else{
						discoveries[index].explored = true;
						if(Object.keys(url_paths).length > Object.keys(discoveries[index].paths).length){
							discoveries[index].paths = url_paths;
						}
						resolve(JSON.stringify(discoveries[index].paths));
					}
				}
			);

		});

		serviceTimeout = setTimeout(reject('Timeout'), 60000); //timeout after 1 minute

	});

	serviceRetrieval.then(function(results){
		if(serviceTimeout){
			clearTimeout(serviceTimeout);
		}
		console.log('Successfully retrieved services');
		response.write(results);
		response.end();
	});
	serviceRetrieval.catch(function(error){
		response.write('Error: ' + error);
		response.end();
	});

}

function getCharacteristics(index, uuid, response){
	var charsRetrieval = new Promise(function(resolve,reject){

		if(!connected){
			console.log('Device not connected');
			connected_peripheral.connect(function(err){
				if(err){
					reject(err);
				}else{
					connected = true;
				}
			});
		}

		connected_peripheral.discoverServices([uuid], function(servicesErr,services){

			if(servicesErr){
				reject(servicesErr);
			}else{

				var results = {};
				var i = 0;

				async.whilst(
					function(){ return i < services.length; },
					function(callback){
						var service = services[i];
						service.discoverCharacteristics([], function(charErr, characteristics){

							if(charErr){
								callback(charErr);
							}else{
								for(var j = 0; j < characteristics.length; j++){
									var c = characteristics[j];

									results[c.uuid] = {
										name: c.name,
										properties: c.properties
									};
								}
								i++;
								callback(null,JSON.stringify(results));
							}

						});
					},
					function(error,results){
						if(error){
							reject(error);
						}else{
							resolve(results);
						}
					}
				);

			}

		});

	});

	charsRetrieval.then(function(results){
		console.log('Successfully retrieved characteristics');
		discoveries[index].paths[uuid] = results;
		response.write(results);
		response.end();
	
	});
	charsRetrieval.catch(function(error){
		response.write('Error: ' + error);
		response.end();
	});
	
}

/*
read given characteristic
*/
function read(response, service, characteristic){

	var readTimeout;

	var readChar = new Promise(function(resolve,reject){

		if(!connected){
			connected_peripheral.connect(function(error){
				if(error){
					reject(error);
				}else{
					connected = true;
				}
			});
		}

		connected_peripheral.discoverServices([service], function(serviceErr,services){

			if(serviceErr){
				reject(serviceErr);
			}else{
				var i = 0;
				async.whilst(
					function(){ return i < services.length; },
					function(callback){
						var service = services[i++];

						service.discoverCharacteristics([characteristic], function(charErr,characteristics){
							if(charErr){
								callback(charErr);
							}else{

								var result;
								for(var j = 0; j < characteristics.length; j++){
									var c = characteristics[j];

									c.read(function(err,data){
										if(err){
											reject(err);
										}else{
											var readData = { data: data.readInt16BE(0) };
											console.log(chalk.blue('Data: ' + readData));
											callback(null, JSON.stringify(readData));
										}
									});
								}

							}
						});
					},
					function(err,res){
						if(err){
							reject(err);
						}else{
							resolve(res);
						}
					}
				);
			}

		});

		readTimeout = setTimeout(function(){
			console.log('Timeout called');
			reject('Timeout');
		}, 45000);

	});

	readChar.then(function(result){
		if(readTimeout){
			clearTimeout(readTimeout);
		}
		console.log('Promise fulfilled: ' + result);
		response.write(result);
		response.end();
	}).catch(function(error){
		response.write(error);
		response.end();
	});

}

function readSync(response, service, characteristic){
	var readVal;
	var readTimeout;
	var readPromise = new Promise(function(resolve, reject){

		if(!connected){
			connected_peripheral.connect(function(err){
				if(err){
					reject(err);
				}else{
					connected = true;
				}
			})
		}

		connected_peripheral.discoverServices([service], function(serviceErr,services){

			if(serviceErr){
				reject(serviceErr);
			}else{

				for(var i = 0; i < services.length; i++){

					var thisService = services[i];
					thisService.discoverCharacteristics([characteristic], function(charErr, characteristics){

						if(charErr){
							reject(charErr);
						}else{

							for(var j = 0; j < characteristics.length; j++){
								var c = characteristics[j];

								readVal = c.read(function(err,data){
									if(err){
										return err;
									}else{
										return data.readInt16BE(0);
									}
								});
							}
							resolve(readVal);
						}

					});

				}

			}

		});

		readTimeout = setTimeout(function(){
			console.log('timeout');
			response.write('timeout');
			response.end();
			return;
			
		}, 60000);

	});

	readPromise.then(function(result){
		clearTimeout(readTimeout);
		response.write(result);
		response.end();
	}).catch(function(error){
		response.write(error);
		response.end();
	});
}

function testSub(service,char,response){
	if(!connected){
		connected_peripheral.connect(function(err){
			if(err){
				response.write(err);
				response.end();
			}else{
				connected = true;
			}
		});
	}

	connected_peripheral.discoverServices([service],function(serviceErr,services){
		if(serviceErr){
			response.write(serviceErr);
			response.end();
		}else{
			var s = services[0];
			s.discoverCharacteristics([char],function(charErr,chars){
				if(charErr){
					response.write(charErr);
					response.end();
				}else{
					var c = chars[0];
					c.subscribe(function(subErr){
						if(subErr){
							response.write(subErr)
							response.end();
						}
					});

					c.on('data',function(data,isNotification){

						var jsonOut = {
							time: new Date(),
							value: data.readInt16BE(0)
						};

						response.write(JSON.stringify(jsonOut));
					});

				}
			});
		}
	})
}

function subscribe(service,char,response){
	var subPromise = new Promise(function(resolve,reject){

		if(!connected){
			connected_peripheral.connect(function(err){
				if(err){
					reject(err);
				}else{
					connected = true;
				}
			});
		}

		connected_peripheral.discoverServices([service],function(serviceErr,services){

			if(serviceErr){
				reject(serviceErr);
			}else{
				for(var s in services){
					var thisService = services[s];

					thisService.discoverCharacteristics([char], function(charErr,chars){
						if(charErr){
							reject(charErr);
						}else{
							for(var c in chars){

								var thisChar = chars[c];
								thisChar.subscribe(function(subscribeErr){
									if(subscribeErr){
										reject(subscribeErr);
									}
								});

								//isNotification is deprecated
								thisChar.on('data',function(data,isNotification){
									var thisTopic = discoveries_LUT[connected_peripheral.id]+'/'+service+'/'+char;

									var message = {
										topic: thisTopic,
										payload: data.readInt16BE(0),
										qos: 0,
										retain: false
									};

									mqttServer.publish(message,function(){
										console.log(thisTopic + ': data published');
									});
								});
								resolve('Initiated Subscription');
							}
						}
					});
				}
			}

		});

	});

	subPromise.then(function(results){
		console.log('Subscribe: '+results);
		response.write(results);
		response.end();
	}).catch(function(error){
		console.log('Subscribe: '+error);
		response.write(error);
		response.end();
	});

}