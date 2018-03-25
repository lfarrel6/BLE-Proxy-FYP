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
		wellKnown(response);

	} else{
		//process get requests for other devices
		//URI structure: https://docs.google.com/document/d/1GqtmLli6Ir9sQcguDK4Bmhh9O_I5s4M740KlFlFNurI/

		if(splitUrl.length > 2){

			var deviceId = splitUrl[1];

			if(splitUrl[2] == "exp"){
				console.log(chalk.cyan('Exploring device:' + deviceId));
				//explore this device

				var device = discoveries[ discoveries_LUT[deviceId] ];
				if(device.paths.length > 0){
					console.log(chalk.bgGreen('Paths already exists: ' + device.paths));
					response.write(device.paths);
					response.end();
				}else{

					var index = discoveries_LUT[deviceId];
					console.log(index);
					if(typeof index != 'undefined'){
					
						//Rewriting service retrieval into promises
						var serviceRetrieval = new Promise(function(resolve,reject){
							var services = getServicesSync(index);
							if(typeof services != 'undefined'){
								resolve(services);
							}else{
								reject(Error("No Services"));
							}
						});

						serviceRetrieval.then(function(result){
							console.log('Success: ' + result);
							response.write(result);
							response.end();
						}).catch(function(err){
							//rejected
							console.log(err);
							response.write("No services found");
							response.end();
						});

						/*var services = getServicesSync(index);
						if(services != null){
							console.log(chalk.cyan(services));
							response.write(services);
							response.end();
							console.log(chalk.green('>Services sent!'))
						}else{
							response.write('Error: No Services Found');
							response.end();
							console.log(chalk.red('No Services found on requested device'));
						}*/
					}else{
						console.log(chalk.red('Error: Unknown peripheral'));
						response.write('Unknown device id');
						response.end();
					}
				}
			}else{
				//service interaction
				var service = splitUrl[2];
				/*
				service will contain a UUID
				interact with service/characteristic
				- requires service validation
				*/

				var deviceJSON = discoveries[deviceId];
				if(deviceJSON && deviceJSON.paths.includes(service)){

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

	console.log(chalk.cyan('WELL KNOWN PROCESSING'));
	var modLUT = {};

	var i = 0;
	var keys = Object.keys(discoveries_LUT);
	
	async.whilst(
		function(){ return i < keys.length; },
		function(callback){
			//cycle through discoveries
			
			console.log(chalk.cyan('ITERATING THROUGH PERIPHERALS'));
			var thisDiscovery = discoveries[ discoveries_LUT[ keys[i] ] ];
			modLUT[keys[i]] = {'info': thisDiscovery.info, 'available': thisDiscovery.inRange};

			i++;
			callback(null,modLUT);
		},
		function(err, results){
			console.log(chalk.cyan('ITERATIONS COMPLETE\nRESULTS: ' + JSON.stringify(results)));
			
			if(err){
				console.log(chalk.red('L112, WELL KNOWN REQUEST ERROR: ' + err));
				return null;
			}else{
				console.log(chalk.cyan('RETURNING RESULTS'));
				if(typeof results !== undefined){
					res.write(JSON.stringify(results));
				}else{
					console.log('no results');
					res.write('No data exists on this proxy!');
				}
				console.log(res.payload);
				res.end();
			}
		}
	);
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
		noble.startScanning([], false);
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
			"paths": [],
			"inRange": true,
			"lastSeen": Date.now()
		});

		getServices(this_index);
		
		console.log(chalk.green('> New peripheral discovered: ' + peripheral.advertisement.localName + ' @ ' + new Date()));

	}

	discoveries[ discoveries_LUT[id] ].lastSeen = Date.now();
	if(!discoveries[ discoveries_LUT[id] ].inRange){
		console.log(chalk.green('> Peripheral back in range'));
		discoveries[ discoveries_LUT[id] ].inRange = true;
	}
});

function getServicesSync(index){
	console.log('Synchronous service retrieval');
	var requestedPeripheral = discoveries[index].peripheral;
	var url_paths=[];

	requestedPeripheral.on('disconnect',function(){
		noble.startScanning();
		//return url_paths;
	});

	requestedPeripheral.connect(function(err){
		if(err){
			console.log('connect err ' + err);
		}else{
			console.log('connected');
			requestedPeripheral.discoverServices([], function(error,services){
				for(var i = 0; i < services.length; i++){
					console.log(chalk.bgGreen(services[i].uuid));
					url_paths.push(services[i].uuid);
				}
				discoveries[index].paths = url_paths;
				requestedPeripheral.disconnect();
			});
		}
	});
}

//response optional parameter
function getServices(index, res = null){
	var requestedPeripheral = discoveries[index].peripheral;
	console.log(chalk.cyan('Fetching Services'));
	var url_paths = [];

	requestedPeripheral.on('disconnect', function(){
		console.log(chalk.green('> Requested Peripheral disconnect @ ' + new Date()));
		noble.startScanning();
	});

	requestedPeripheral.connect(function(err){

		console.log(chalk.cyan('Connecting to peripheral'));

		if(err){
			console.log(chalk.red('CONNECT ERROR: ' + err));
		}

		requestedPeripheral.discoverServices([], function(error, services){
			var i = 0, paths = 0;
			console.log(chalk.cyan('Service discovery'));
			async.whilst(
				function(){ return i < services.length; },
				function(callback){
					var service = services[i];

			        //if (services_lookup_table[service.uuid]) {
			        	url_paths.push(service.uuid);
			        	paths++;

			        	console.log(chalk.green('> ' + service.uuid));
			        //}
			        i++;
			        callback(null, url_paths);
				},
				function(err, results){ 
					if(err){
						requestedPeripheral.disconnect();
						discoveries[index].paths = [];
						if(res){
							res.write('No services found');
							res.end();
						}else{
							console.log('no services found');
						}

						console.log(chalk.red('L239, ASYNC ERROR: ' + err));
					}else{
						requestedPeripheral.disconnect();
						discoveries[index].paths = results;
						if(res){
							res.write(JSON.stringify(results));
							res.end();
						}
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
					console.log(chalk.red('L296, ASYNC ERROR: ' + err));
					return null;
				}else{
					return results;
				}
			}
		);
	});
}

/*
read given characteristic
*/
function read(response, deviceJSON, service, characteristic){
	var peripheral = deviceJSON.peripheral;

	peripheral.connect(function(conn_error){
		peripheral.discoverServices([service],function(service_err, services){

			if(service_err){
				console.log(chalk.red('Error in connecting to service (' + services_lookup_table[service] + '): ' + service_err));
			}else{
				var i = 0;
				async.whilst( 
					function(){ return i < services.length; }, 
					function(callback){
						var service = services[i];

						service.discoverCharacteristics([characteristic], function(character_err,characteristics){
				
							if(character_err){
								console.log(chalk.red('L328, Error connecting to characteristic (', chars_lut[characteristic] + '): ' + character_err));
								callback(character_err);
							}else{
								var response_data;
				
								var j = 0;

								async.whilst(
									function(){ return j < characteristics.length; },
									function(nested_callback){
										var c = characteristics[j];

										c.read(function(err,data){
											if(err){
												console.log(chalk.red('L342, Error Reading Characteristic (' + chars_lut[c] + '): ' + err));
											
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
											console.log(chalk.red('L355, Error during Characteristic read: ', err));
											callback(err);
										}else{
											callback(null,results);
										}
									});
							}
							i++;
						})
					},
					function(err,results){
						if(err){
							console.log(chalk.red('L367, ASYNC ERROR: ' + err));
						}else{
							response.json(results);
							//requestComplete(response,0);
						}
					});
			}
		});
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