var noble                      = require('noble')
  , coap                       = require('coap')
  , async                      = require('async')
  , chalk                      = require('chalk')
  , sizeof                     = require('object-sizeof')
  , server                     = coap.createServer()
  , discoveries                = []
  , discoveries_LUT            = {}   //To allow for more simple indexing of peripherals using a lut to relate id's to indexes 
  , proximity_timeout          = 5000 //if a discovery is out of range after 2000 milliseconds, delete it from our list
  , services_lookup_table      = require('./assets/services-lut.json')
  , reverse_services_lut       = require('./assets/reversed-services-lut.json')
  , chars_lut                  = require('./assets/characteristic-lut.json')
  , reverse_chars_lut          = require('./assets/reversed-characteristics-lut.json');

server.on('request', function(req, res){
	console.log(chalk.green(req.method + ' request'));

	switch(req.method){
		case 'GET':
			console.log(chalk.cyan('GET REQUEST RECEIVED'));
			get(req.url, res);
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

function get(url, response){
	var splitUrl = url.split('/');

	if(splitUrl.length == 2){
		console.log(chalk.blue('ALIVE'));
		response.write('roger');
		response.end();
	}

	//coap standard uri for important information on server
	if(splitUrl.length > 2 && splitUrl[1] === '.well-known' && splitUrl[2] === "core"){

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

			if(splitUrl[2] == "exp"){
				console.log(chalk.cyan('Exploring device:' + deviceId));
				//explore this device

				console.log(discoveries_LUT[deviceId]);
				if(discoveries_LUT[deviceId]){

					getServicesSync(discoveries_LUT[deviceId],response);
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

				var deviceJSON = discoveries[ discoveries_LUT[deviceId] ];
				console.log(chalk.inverse('paths[service] = ' + JSON.stringify(deviceJSON.paths[service])));
				if(deviceJSON && deviceJSON.paths[service]){

					if(deviceJSON.inRange){
						console.log(chalk.inverse('Device in range'));
						var argFour = splitUrl[3];
						if(argFour == 'getChars'){

							getCharacteristics(deviceJSON.peripheral, service, function(x){ 
									response.write(x);
									response.end();
							});

						}else{
							//get request to a characteristic is a read
					
							read(response,deviceJSON,service,characteristic);
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
	var keys = Object.keys(discoveries_LUT);
	
	var getDiscoveries = new Promise(function(resolve,reject){
		async.whilst(
			function(){ return i < keys.length && responseLength < 5; },
			function(callback){
				var thisDiscovery = discoveries[ discoveries_LUT[ keys[i] ] ];
				modLUT[keys[i]] = { 'info': thisDiscovery.info, 'available': thisDiscovery.inRange };

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
		setTimeout(reject('Timeout'),15000);
	});
	getDiscoveries.then(function(result){
		res.write(result);
		res.end();
	}).catch(function(err){
		console.log(chalk.red(err));
		res.write(err);
		res.end();
	});

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
		noble.startScanning([], true);
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
			"lastSeen": Date.now()
		});
		console.log(chalk.magenta(JSON.stringify(peripheral.advertisement.serviceData)+'\n'+JSON.stringify(peripheral.advertisement.serviceUuids)));
		var services = [];
		if(peripheral.advertisement.serviceData && peripheral.advertisement.serviceData.length > 0){
			
			for(var s in peripheral.advertisement.serviceData){
				services.push(peripheral.advertisement.serviceData[s].uuid);
			}
			console.log(chalk.magenta('Advertisement Services: ' + services));
		}
		if(peripheral.advertisement.serviceUuids && peripheral.advertisement.serviceUuids.length > 0){
			for(var uuid in peripheral.advertisement.serviceUuids){
				services.push(peripheral.advertisement.serviceUuids[uuid]);
			}
		}
		if(services.length>0){
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
	noble.stopScanning();
	var requestedPeripheral = discoveries[index].peripheral;
	var url_paths={};

	var retrieveServicesSync = new Promise(function(resolve,reject){
		console.log('Synchronous service retrieval');

		requestedPeripheral.on('disconnect',function(){
			console.log('Disconnected in services sync');
		});

		requestedPeripheral.connect(function(err){
			if(err){
				console.log('connect err ' + err);
				reject(err);
			}else{
				console.log('connected to ' + discoveries[index].info);
				requestedPeripheral.discoverServices([], function(error,services){
					if(error){
						reject(error);
					}else{
						for(var i = 0; i < services.length; i++){
							console.log(chalk.bgGreen(services[i].uuid));

							url_paths[services[i].uuid] = {};
						}
						if(Object.keys(discoveries[index].paths).length < Object.keys(url_paths).length){
							discoveries[index].paths = url_paths;
							resolve(JSON.stringify(url_paths));
						}else{
							resolve(JSON.stringify(discoveries[index].paths));
						}
					}
				});
			}
		});
		
		//call timeout after 30 seconds
		setTimeout(function(){
			reject('Timeout');
		}, 30000);
	});
	
	retrieveServicesSync.then(function(result){

		requestedPeripheral.disconnect();
		response.write(result);
		response.end();
		noble.startScanning();

	}).catch(function(err){
		
		requestedPeripheral.disconnect();
		response.write('Error: ' + err);
		response.end();
		noble.startScanning();

	});

}

//response optional parameter
function getServices(index,response){
	noble.stopScanning();
	var requestedPeripheral = discoveries[index].peripheral;
	console.log(chalk.cyan('Fetching Services'));
	var url_paths = {};

	var serviceRetrieval = new Promise(function(resolve,reject){
		console.log("Async service retrieval");

		requestedPeripheral.on('disconnect', function(){
			console.log('Disconnected in service retrieval');
		});

		requestedPeripheral.connect(function(err){

			console.log(chalk.cyan('Connecting to peripheral'));
			if(err){
				console.log(chalk.red('Connect Error: ' + err));
				reject(err);
			}
			else{
				requestedPeripheral.discoverServices([], function(error,services){

					var i = 0, paths = 0;

					async.whilst(
						function(){ return i < services.length; },
						function(serviceCallback){
							var service = services[i];

							if(!url_paths[service.uuid]){
								url_paths[service.uuid] = {};
							}
							console.log(chalk.green('> ' + service.uuid));
							i++;

							serviceCallback(null,url_paths);
						},
						function(err,results){
							if(err){
								reject(err);
							}else{
								if(Object.keys(url_paths).length > Object.keys(discoveries[index].paths).length){
									discoveries[index].paths = url_paths;
								}
								resolve(JSON.stringify(discoveries[index].paths));
							}
						}
					)

				});
			}
		});

		setTimeout(reject('Timeout'), 60000); //timeout after 1 minute

	});

	serviceRetrieval.then(function(results){
		
		requestedPeripheral.disconnect();
		response.write(results);
		response.end();
		noble.startScanning();

	}).catch(function(error){
		
		requestedPeripheral.disconnect();
		response.write('Error: ' + error);
		response.end();
		noble.startScanning();

	});

}

function getCharacteristics(peripheral, uuid, response){
	noble.stopScanning();
	console.log(chalk.bgCyan('Getting ' + uuid + ' from ' + peripheral.advertisement.localName));


	var charsRetrieval = new Promise(function(resolve,reject){

		peripheral.on('disconnect', function(){
			console.log('Disconnect in getCharacteristics');
		});

		peripheral.connect(function(connectErr){

			if(connectErr){
				console.log(chalk.red('Error in get characteristics: ' + connectErr));
				reject(connectErr);
			}else{
				console.log(chalk.bgCyan('Connected in get characteristics'));
				peripheral.discoverServices([uuid], function(servicesErr,services){

					if(servicesErr){
						console.log(chalk.red('Error discovering services: ' + servicesErr));
						reject(servicesErr);
					}else{
						console.log('Services length: ' + services.length);

						for(var i = 0; i < services.length; i++){

							var service = services[i];
							service.discoverCharacteristics([],function(characteristicsErr,characteristics){
								if(characteristicsErr){
									
									console.log(chalk.red('Error discovering characteristics: ' + characteristicsErr));
									reject(characteristicsErr);

								}else{

									console.log(chalk.bgCyan(characteristics));
									var results = {};
									for(var j = 0; j < characteristics.length; j++){
										var thisChar = characteristics[j];
										results[thisChar.uuid] = thisChar.name;
									}

									resolve(JSON.stringify(results));

								}
							})

						}
					}

				});
			}
		})

		setTimeout(reject('Timeout'), 45000);
	});

	charsRetrieval.then(function(results){
		peripheral.disconnect();
		response.write(results);
		response.end();
		noble.startScanning();
	}).catch(function(error){

		peripheral.disconnect();
		response.write('Error: ' + results);
		response.end();
		noble.startScanning();

	});
	
}

/*
read given characteristic
*/
function read(response, deviceJSON, service, characteristic){
	noble.stopScanning();
	console.log('Reading characteristic ' + characteristic);

	var peripheral = deviceJSON.peripheral;

	var readChar = new Promise(function(resolve,reject){

		peripheral.on('disconnect',function(){
			console.log('Disonnect in read');
		});

		peripheral.connect(function(connErr){

			if(connErr){
			
				console.log('Connection eror in read: ' + connErr);
				reject(connErr);
			
			}else{

				peripheral.discoverServices([service],function(serviceErr,services){

					if(serviceErr){
						console.log('Service discovery error: ' + serviceErr);
						reject(serviceErr);
					}else{
						var i = 0;
						async.whilst(
							function(){ return i < services.length; },
							function(callback){
								var service = services[i];
								i++;
								service.discoverCharacteristics([characteristic], function(charErr,characteristics){

									if(charErr){
										console.log(chalk.red('Characteristic discovery error: ' + charErr));
										reject(charEr);
									}else{

										var responseData, j = 0;

										async.whilst(
											function(){ return j < characteristics.length; },
											function(nested_callback){
												var c = characteristics[j];

												c.read(function(err,data){
													if(err){
														console.log(chalk.red('Error in read: ' + err));
														reject(err);
													}else{

														responseData+=data;
														j++;
														nested_callback(null,responseData);

													}
												});
											},
											function(error,result){
												if(error){
													reject(error);
												}else{
													resolve(JSON.stringify(result));
												}
											}
										);

									}

								});
							},
							function(error,results){
								if(error){
									reject(error);
								}else{
									resolve(JSON.stringify(results));
								}
							}
						);
					}

				});

			}

		});

		setTimeout(reject('Timeout'),90000); // timeout after a minute and a half

	});

	readChar.then(function(result){
		
		peripheral.disconnect();
		response.write(result);
		response.end();
		noble.startScanning();

	}).catch(function(error){

		peripheral.disconnect();
		response.write(error);
		response.end();
		noble.startScanning();

	});

}
/*
setInterval(function(){
	for(var id in discoveries){
		if(discoveries[id].lastSeen < (Date.now() - proximity_timeout) && discoveries[id]["inRange"]){
			console.log(chalk.green('> Lost peripheral ' + discoveries[id].info));
			discoveries[id]["inRange"] = false;
			console.log(chalk.cyan(discoveries[id]["inRange"]));
		}
	}
}, proximity_timeout/2); //check list every 1000ms to see if devices have been lost
*/