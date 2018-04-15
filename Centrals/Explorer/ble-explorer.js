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

var DeviceManager = require('./assets/deviceManager');
var manager = new DeviceManager();

var connected_peripheral, connected = false;

/* Incoming reqs
URI                           | PARAM LENGTH | OBSERVE
------------------------------|--------------|---------
/alive                        |      1       |    N
/.well-known/core 			  |      2       |    Y/N
/:deviceID                    |      1       |    N
/:deviceID/exp                |      2       |    N
/:deviceID/:service/getChars  |      3       |    N
/:deviceID/:service/:char/read|      4       |    N
/:deviceID/:service/:char/sub |      4       |    Y
*/

function reqParser(url,response,obs=false){
	var splitUrl = url.substr(1).split('/');
	switch(splitUrl.length){
		case 1:
			console.log(url + ' at length 1');
			/*
			SERVER PINGS
			*/
			if(splitUrl[0] == 'alive'){
				console.log(chalk.green('> Alive'));
				return alive(response);
			}else{
				/*
				CONNECT REQUESTS
				*/
				console.log(chalk.green('> Connect'));
				var deviceId = splitUrl[0];
				deviceConnect(response,deviceId);
				return;
			}
			break;
		case 2:
			/*
			WELL KNOWN
			*/
			console.log(url + ' at length 2');
			if(splitUrl[0] == '.well-known' && splitUrl[1] == 'core'){
				console.log(chalk.green('> Well known'));
				if(obs){
					wellKnownObs(response);
				}else{
					wellKnown(response);
				}
			/*
			GET SERVICES
			*/
			}else if(splitUrl[1] == 'exp'){
				console.log(chalk.green('> Get services'));
				var deviceId = splitUrl[0];
				verifyDevice(deviceId);
				var device = manager.getDevice(deviceId);
				if(device.paths){
					response.write(JSON.stringify(device.paths));
					response.end();
				}else{
					getServices(response);
				}
			}else{
				response.write('Unknown Request');
				response.end();
			}
			break;
		case 3:
			var deviceId = splitUrl[0];
			verifyDevice(deviceId);
			var device = manager.getDevice(deviceId);
			var service = splitUrl[1];
			/*
			GET CHARACTERISTICS
			*/
			if(splitUrl[2] == 'getChars'){
				console.log(chalk.green('> Get characteristics'));
				var chars = Object.keys(device.paths[service]);
				if(chars.length > 0){
					response.write(device.paths[service]);
					response.end();
				}else{
					getCharacteristics(deviceId, service, response);
				}
			}else{
				response.write('Unknown request');
				response.end();
			}
			break;
		case 4:
			var deviceId = splitUrl[0];
			verifyDevice(deviceId);
			var service = splitUrl[1];
			var char = splitUrl[2];
			/*
			READ
			*/
			if(splitUrl[3] == 'read'){
				console.log(chalk.green('> Read'));
				read(response,service,char);
			}else if(splitUrl[3] == 'sub'){
				console.log(chalk.green('> Subscribe'));
				subscribe(service,char,response);
			}
			break; 
	}
}

function verifyDevice(deviceId){
	var device = manager.getDevice(deviceId);
	if(connected_peripheral.id !== device.peripheral.id){
		disconnectPeripheral();
		connected_peripheral = device.peripheral;
		initialisePeripheral();
	}
	return;
}

function alive(response){
	response.write('alive');
	response.end();
}

function deviceConnect(response, id){
	if(manager.deviceExists(id)){
		console.log(chalk.green('> Device exists, connecting'));
		var device = manager.getDevice(id);
		connected_peripheral = device.peripheral;
		initialisePeripheral();
		response.write('Trying to connect');
		response.end();
	}else{
		disconnectPeripheral();
		response.write('Unknown Peripheral');
		response.end();
	}
}

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
		});

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
	console.log(req.url.substr(1));
	switch(req.method){
		case 'GET':
			console.log(chalk.cyan('GET REQUEST RECEIVED'));
			if(req.headers['Observe']!==0)
				return reqParser(req.url, res);
			reqParser(req.url,res,true);
			break;
		default:
			res.write('Sorry, the server is not yet configured for ' + req.method + ' requests.');
			res.end('\n');
			break;
	}
});

function wellKnownObs(res){
	console.log(chalk.cyan('WELL KNOWN PROCESSING'));

	var all = manager.getAll();
	var keys = Object.keys(all);
	for(var k in keys){
		var thisDiscovery = all[keys[k]];
		try{
			res.write(JSON.stringify({'info': thisDiscovery.info, 'available': thisDiscovery.inRange}));
		}catch(e){
			console.log(e);
		}
	}
	manager.on('new',function(device){
		try{
			res.write(JSON.stringify({'info': device.info, 'available': device.inRange}));
		}catch(e){
			console.log(e);
		}
	});

	res.on('finish',function(){
		console.log('Observe finished');
		return;
	});
}

function wellKnown(res){
	res.write(JSON.stringify(manager.getAll()));
	res.end();
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

	if(!manager.deviceExists(id)){
		var peripheralInfo = 'Device id: ' + id + ' Local Name: ' + peripheral.advertisement.localName;
		
		console.log(chalk.green('> Peripheral Info: ' + peripheralInfo));

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
		var deviceJson = {
			"peripheral": peripheral,
			"info": peripheralInfo,
			"inRange": true,
			"lastSeen": Date.now(),
			"explored": false,
			"paths": services
		};
		manager.addDevice(deviceJson);

		console.log(chalk.green('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date()));
	}

	if(manager.deviceExists(id))
		manager.updateLastSeen(id);
});

function getServicesSync(response){

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
				manager.updateDevice(connected_peripheral.id,'explored',true);
				//discoveries[index].explored = true;
				var device = manager.getDevice(connected_peripheral.id,true);
				var paths;
				if((device.paths) && Object.keys(device.paths).length < Object.keys(url_paths).length){
					manager.updateDevice(connected_peripheral.id,'paths',url_paths);
					//disoveries[index].paths = url_paths;
					paths = url_paths;
				}else{
					paths = device.paths;
				}
				resolve(JSON.stringify(paths));
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
function getServices(response){

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
						var device = manager.getDevice(connected_peripheral.id,true);
						manager.updateDevice(connected_peripheral.id,'explored',true);
						//discoveries[index].explored = true;
						var paths = device.paths;
						if(Object.keys(url_paths).length > Object.keys(device.paths).length){
							manager.updateDevice(connected_peripheral.id,'paths',url_paths);
							//discoveries[index].paths = url_paths;
							paths = url_paths;
						}
						resolve(JSON.stringify(paths));
					}
				}
			);

		});

		serviceTimeout = setTimeout(reject('Timeout'), 10000); //timeout after 1 minute

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

									console.log('This char: ' + (c));

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
		var device = manager.getDevice(connected_peripheral.id,true);
		device.paths[uuid] = results;
		manager.postDevice(connected_peripheral.id,device,true);
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
											console.log(c.name + ': ' + data.toString());

											var translatedData;
											try{
												translatedData = data.readInt16BE(0);
											}catch(e){
												console.log(e);
												translatedData = data.toString();
											}

											var readData = { data: translatedData };
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

function subscribe(service,char,response){
	if(!connected){
		connected_peripheral.connect(function(err){
			if(err){
				response.write(JSON.stringify(err));
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

						var translatedData;
						try{
							translatedData = data.readInt16BE(0);
						}catch(e){
							console.log(e);
							translatedData = data.toString();
						}
						var jsonOut = {
							time: Date.now(),
							value: translatedData
						};

						response.write(JSON.stringify(jsonOut));
					});

					response.on('finish',function(){
						console.log('Observe finished');
						c.unsubscribe();
						return;
					})

				}
			});
		}
	})
}